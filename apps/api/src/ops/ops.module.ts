import { Module } from '@nestjs/common';
import { and, desc, eq } from 'drizzle-orm';
import { db, executionDlq, executions } from '@octo/database';
import { createQueue, QUEUES } from '@octo/queue';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { HealthModule } from '../health/health.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { OpsV1Controller, OpsExecutionController } from './ops-v1.controller';
import { OpsV1Service } from './ops-v1.service';

@Module({
  imports: [HealthModule, JwtAuthModule],
  controllers: [OpsController, OpsV1Controller, OpsExecutionController],
  providers: [
    OpsService,
    {
      provide: OpsV1Service,
      useFactory: () => new OpsV1Service({
        listDlq: async (tenantId, q) => {
          const page = Number(q.page ?? 1); const pageSize = Number(q.pageSize ?? 20);
          const jobs = await db.select().from(executionDlq).where(eq(executionDlq.tenantId, tenantId)).orderBy(desc(executionDlq.createdAt)).limit(pageSize);
          return { jobs, total: jobs.length, page, pageSize };
        },
        requeue: async (tenantId, _actorId, jobId, _b) => {
          const q = createQueue(QUEUES.EXECUTION_RECLAIM, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
          await q.add('requeue', { tenantId, executionId: jobId, mode: 'reclaim' }, { jobId: `requeue:${jobId}` });
          await q.close();
          return { jobId, executionId: jobId, requeued: true, targetQueue: QUEUES.EXECUTION_RECLAIM };
        },
        discard: async () => undefined,
        metrics: async (tenantId) => {
          const rows = await db.select({ state: executions.state }).from(executions).where(eq(executions.tenantId, tenantId));
          return { windowSeconds: 300, reclaimRate: 0, successRate: 0, dlqRate: 0, p50LatencyMs: null, p95LatencyMs: null, activeExecutions: rows.filter(r=>r.state==='RUNNING').length, queuedExecutions: rows.filter(r=>r.state==='QUEUED').length, failedExecutions: rows.filter(r=>r.state==='FAILED').length, checkedAt: new Date().toISOString() };
        },
        stale: async (tenantId) => {
          const rows = await db.select().from(executions).where(and(eq(executions.tenantId, tenantId), eq(executions.state, 'RUNNING'))).limit(100);
          return { executions: rows, checkedAt: new Date().toISOString() };
        },
        reset: async (tenantId, _actorId, executionId, _b) => {
          const updated = await db.update(executions).set({ state: 'QUEUED', status: 'queued', updatedAt: new Date() }).where(and(eq(executions.tenantId, tenantId), eq(executions.id, executionId))).returning({ id: executions.id, state: executions.state });
          const row = updated[0];
          return row ? { executionId: row.id, state: row.state, reset: true } : null;
        },
      }),
    },
  ],
})
export class OpsModule {}
