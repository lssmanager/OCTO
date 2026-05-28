import { Module } from '@nestjs/common';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { db, executions, workerHeartbeats } from '@octo/database';
import { createQueue, QUEUES } from '@octo/queue';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { HealthModule } from '../health/health.module';
import { HealthService } from '../health/health.service';
import { RuntimeController } from './runtime.controller';
import { RuntimeService } from './runtime.service';

@Module({
  imports: [JwtAuthModule, HealthModule],
  controllers: [RuntimeController],
  providers: [{
    provide: RuntimeService,
    useFactory: (healthService: HealthService) => new RuntimeService({
      health: async () => healthService.check(),
      queues: async () => {
        const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
        const queue = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl });
        try {
          const [dispatchWaiting, dispatchActive, dispatchFailed] = await Promise.all([
            queue.getWaitingCount(), queue.getActiveCount(), queue.getFailedCount(),
          ]);
          return { checkedAt: new Date().toISOString(), queues: [
            { name: QUEUES.EXECUTION_DISPATCH, status: 'ok', waiting: dispatchWaiting, active: dispatchActive, failed: dispatchFailed },
            { name: QUEUES.EXECUTION_RECLAIM, status: 'not_active', waiting: 0, active: 0, reason: 'reserved_for_future_split_no_f1_consumer' },
          ] };
        } finally {
          await queue.close().catch(() => undefined);
        }
      },
      workers: async (_tenantId: string) => {
        const rows = await db
          .select({
            workerType: workerHeartbeats.workerType,
            instanceId: workerHeartbeats.instanceId,
            status: workerHeartbeats.status,
            lastHeartbeatAt: workerHeartbeats.lastHeartbeatAt,
            error: workerHeartbeats.error,
          })
          .from(workerHeartbeats)
          .orderBy(desc(workerHeartbeats.lastHeartbeatAt))
          .limit(100);
        const staleSecs = Number(process.env['OPS_WORKER_HEARTBEAT_STALE_SECONDS'] ?? '90');
        const byType = new Map<string, { workerType: 'runtime-worker' | 'scheduler-worker' | 'reclaimer-worker'; instanceId: string; status: string; lastHeartbeatAt: Date; error: string | null }>();
        for (const row of rows as { workerType: 'runtime-worker' | 'scheduler-worker' | 'reclaimer-worker'; instanceId: string; status: string; lastHeartbeatAt: Date; error: string | null }[]) {
          if (!byType.has(row.workerType)) byType.set(row.workerType, row);
        }
        const project = (workerType: 'runtime-worker' | 'scheduler-worker' | 'reclaimer-worker') => {
          const row = byType.get(workerType);
          if (!row) return { name: workerType, status: 'unknown', reason: 'no_heartbeat_source' };
          const stale = Date.now() - row.lastHeartbeatAt.getTime() > staleSecs * 1000;
          return {
            name: workerType,
            status: stale ? 'degraded' : row.status === 'error' ? 'error' : 'ok',
            lastHeartbeatAt: row.lastHeartbeatAt,
            instanceId: row.instanceId,
            reason: stale ? 'heartbeat_stale' : row.error ?? undefined,
          };
        };
        return {
          checkedAt: new Date().toISOString(),
          workers: [project('runtime-worker'), project('scheduler-worker'), project('reclaimer-worker')],
        };
      },
      getExecution: async (tenantId: string, executionId: string) => {
        const row = await db.select().from(executions).where(and(eq(executions.tenantId, tenantId), eq(executions.id, executionId))).limit(1);
        const ex = row[0]; if (!ex) return null;
        const stale = !!ex.leaseExpiresAt && ex.leaseExpiresAt.getTime() < Date.now() && ['running','dispatched','reclaimable'].includes(ex.status);
        return { id: ex.id, state: ex.status, stale };
      },
      enqueueReclaim: async (tenantId: string, executionId: string) => {
        const q = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
        await q.add('dispatch', { tenantId, executionId, reason: 'manual_replay', attempt: 1, enqueuedAt: new Date().toISOString() }, { jobId: `manual-reclaim:${executionId}` });
        await q.close();
      },
      cancelAll: async (tenantId: string, states: string[]) => {
        const rows = await db.select({ id: executions.id, state: executions.status }).from(executions).where(and(eq(executions.tenantId, tenantId), inArray(executions.status, states as any)));
        const ids = rows.map((r) => r.id);
        if (ids.length === 0) return { requestedCount: 0, skippedTerminalCount: 0 };
        await db.update(executions).set({ state: 'cancelled', status: 'cancelled', updatedAt: new Date() }).where(and(eq(executions.tenantId, tenantId), inArray(executions.id, ids)));
        return { requestedCount: ids.length, skippedTerminalCount: 0 };
      },
    }),
    inject: [HealthService],
  }],
})
export class RuntimeModule {}
