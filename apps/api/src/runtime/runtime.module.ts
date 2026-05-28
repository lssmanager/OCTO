import { Module } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { db, executions } from '@octo/database';
import { createQueue, QUEUES, RESERVED_QUEUES } from '@octo/queue';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { HealthModule } from '../health/health.module';
import { HealthService } from '../health/health.service';
import { RuntimeController } from './runtime.controller';
import { RuntimeService } from './runtime.service';

@Module({
  imports: [JwtAuthModule, HealthModule],
  controllers: [RuntimeController],
  providers: [
    {
      provide: RuntimeService,
      useFactory: (healthService: HealthService) =>
        new RuntimeService({
          health: async () => healthService.check(),
          queues: async () => {
            const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
            const dispatchQueue = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl });

            try {
              const [dispatchWaiting, dispatchActive] = await Promise.all([
                dispatchQueue.getWaitingCount(),
                dispatchQueue.getActiveCount(),
              ]);

              return {
                checkedAt: new Date().toISOString(),
                queues: [
                  {
                    name: QUEUES.EXECUTION_DISPATCH,
                    status: 'active',
                    waiting: dispatchWaiting,
                    active: dispatchActive,
                  },
                  {
                    name: RESERVED_QUEUES.EXECUTION_RECLAIM,
                    status: 'not_active',
                    waiting: 0,
                    active: 0,
                    reason: 'reserved_for_future_f1_split_no_consumer',
                  },
                ],
              };
            } finally {
              await dispatchQueue.close();
            }
          },
          workers: async (tenantId: string) => {
            const latest = await db
              .select({ updatedAt: executions.updatedAt, leaseOwner: executions.leaseOwner })
              .from(executions)
              .where(eq(executions.tenantId, tenantId))
              .orderBy(executions.updatedAt)
              .limit(200);
            const hb =
              latest
                .filter((r) => r.leaseOwner)
                .map((r) => r.updatedAt)
                .filter(Boolean)
                .sort((a, b) => +new Date(b as any) - +new Date(a as any))[0] ?? null;
            const staleSecs = Number(process.env['OPS_WORKER_HEARTBEAT_STALE_SECONDS'] ?? '90');
            const runtimeOk = hb ? Date.now() - new Date(hb as any).getTime() <= staleSecs * 1000 : false;
            return {
              checkedAt: new Date().toISOString(),
              workers: [
                {
                  name: 'runtime-worker',
                  status: runtimeOk ? 'ok' : 'unknown',
                  lastHeartbeatAt: hb,
                  reason: runtimeOk ? undefined : 'heartbeat_unavailable_or_stale',
                },
                { name: 'scheduler-worker', status: 'unknown', reason: 'no_heartbeat_source' },
                { name: 'reclaimer-worker', status: 'unknown', reason: 'no_heartbeat_source' },
              ],
            };
          },
          getExecution: async (tenantId: string, executionId: string) => {
            const row = await db
              .select()
              .from(executions)
              .where(and(eq(executions.tenantId, tenantId), eq(executions.id, executionId)))
              .limit(1);
            const ex = row[0];
            if (!ex) return null;
            const stale =
              !!ex.leaseExpiresAt &&
              ex.leaseExpiresAt.getTime() < Date.now() &&
              ['running', 'dispatched', 'reclaimable'].includes(ex.status);
            return { id: ex.id, state: ex.status, stale };
          },
          enqueueReclaim: async (tenantId: string, executionId: string) => {
            const q = createQueue(QUEUES.EXECUTION_DISPATCH, {
              redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
            });
            try {
              await q.add(
                QUEUES.EXECUTION_DISPATCH,
                {
                  tenantId,
                  executionId,
                  reason: 'manual_replay',
                  attempt: 1,
                  enqueuedAt: new Date().toISOString(),
                },
                { jobId: `manual-reclaim:${executionId}`, priority: 1 }
              );
            } finally {
              await q.close();
            }
          },
          cancelAll: async (tenantId: string, states: string[]) => {
            const rows = await db
              .select({ id: executions.id, state: executions.status })
              .from(executions)
              .where(and(eq(executions.tenantId, tenantId), inArray(executions.status, states as any)));
            const ids = rows.map((r) => r.id);
            if (ids.length === 0) return { requestedCount: 0, skippedTerminalCount: 0 };
            await db
              .update(executions)
              .set({ state: 'cancelled', status: 'cancelled', updatedAt: new Date() })
              .where(and(eq(executions.tenantId, tenantId), inArray(executions.id, ids)));
            return { requestedCount: ids.length, skippedTerminalCount: 0 };
          },
        }),
      inject: [HealthService],
    },
  ],
})
export class RuntimeModule {}
