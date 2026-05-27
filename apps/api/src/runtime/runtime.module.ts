import { Module } from '@nestjs/common';
import { and, eq, inArray } from 'drizzle-orm';
import { db, executions } from '@octo/database';
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
        const qd = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl });
        const qr = createQueue('execution.reclaim', { redisUrl });
        const [dispatchWaiting, dispatchActive, reclaimWaiting, reclaimActive] = await Promise.all([
          qd.getWaitingCount(), qd.getActiveCount(), qr.getWaitingCount(), qr.getActiveCount(),
        ]);
        await qd.close(); await qr.close();
        return { checkedAt: new Date().toISOString(), queues: [
          { name: QUEUES.EXECUTION_DISPATCH, waiting: dispatchWaiting, active: dispatchActive },
          { name: 'execution.reclaim', waiting: reclaimWaiting, active: reclaimActive },
        ] };
      },
      workers: async (_tenantId: string) => ({
        checkedAt: new Date().toISOString(),
        workers: [
          { name: 'runtime-worker', status: process.env['RUNTIME_WORKER_URL'] ? 'configured' : 'not_configured' },
          { name: 'scheduler-worker', status: process.env['SCHEDULER_WORKER_URL'] ? 'configured' : 'not_configured' },
          { name: 'reclaimer-worker', status: process.env['RECLAIMER_WORKER_URL'] ? 'configured' : 'not_configured' },
        ],
      }),
      getExecution: async (tenantId: string, executionId: string) => {
        const row = await db.select().from(executions).where(and(eq(executions.tenantId, tenantId), eq(executions.id, executionId))).limit(1);
        const ex = row[0]; if (!ex) return null;
        const stale = !!ex.leaseExpiresAt && ex.leaseExpiresAt.getTime() < Date.now() && ['RUNNING','DISPATCHED','RECLAIMING'].includes(ex.state);
        return { id: ex.id, state: ex.state, stale };
      },
      enqueueReclaim: async (tenantId: string, executionId: string) => {
        const q = createQueue('execution.reclaim', { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
        await q.add('reclaim', { tenantId, executionId, mode: 'reclaim' }, { jobId: `manual-reclaim:${executionId}` });
        await q.close();
      },
      cancelAll: async (tenantId: string, states: string[]) => {
        const rows = await db.select({ id: executions.id, state: executions.state }).from(executions).where(and(eq(executions.tenantId, tenantId), inArray(executions.state, states as any)));
        const ids = rows.map((r) => r.id);
        if (ids.length === 0) return { requestedCount: 0, skippedTerminalCount: 0 };
        await db.update(executions).set({ state: 'CANCELLED', status: 'cancelled', updatedAt: new Date() }).where(and(eq(executions.tenantId, tenantId), inArray(executions.id, ids)));
        return { requestedCount: ids.length, skippedTerminalCount: 0 };
      },
    }),
    inject: [HealthService],
  }],
})
export class RuntimeModule {}
