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
import { F1StatusService } from './f1-status.service';

@Module({
  imports: [HealthModule, JwtAuthModule],
  controllers: [OpsController, OpsV1Controller, OpsExecutionController],
  providers: [
    OpsService,
    F1StatusService,
    {
      provide: OpsV1Service,
      useFactory: (f1StatusService: F1StatusService) =>
        new OpsV1Service({
          listDlq: async (tenantId, q) => {
            const page = Math.max(Number(q.page ?? 1), 1);
            const pageSize = Math.min(Math.max(Number(q.pageSize ?? 20), 1), 100);
            const jobs = await db
              .select()
              .from(executionDlq)
              .where(eq(executionDlq.tenantId, tenantId))
              .orderBy(desc(executionDlq.createdAt))
              .limit(pageSize)
              .offset((page - 1) * pageSize);
            return { jobs, total: jobs.length, page, pageSize };
          },
          requeue: async (tenantId, _actorId, jobId, _body) => {
            const queue = createQueue(QUEUES.EXECUTION_DISPATCH, {
              redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
            });
            try {
              await queue.add(
                QUEUES.EXECUTION_DISPATCH,
                {
                  tenantId,
                  executionId: jobId,
                  reason: 'manual_replay',
                  attempt: 1,
                  enqueuedAt: new Date().toISOString(),
                },
                { jobId: `requeue:${jobId}`, priority: 1 }
              );
            } finally {
              await queue.close().catch(() => undefined);
            }
            return { jobId, executionId: jobId, requeued: true, targetQueue: QUEUES.EXECUTION_DISPATCH };
          },
          discard: async () => undefined,
          metrics: async (tenantId) => {
            const status = await f1StatusService.getStatus(tenantId, 5);
            return {
              windowSeconds: 300,
              ...status.rates,
              ...status.latencies,
              activeExecutions: status.executions.active,
              queuedExecutions: status.executions.queued,
              failedExecutions: status.executions.failed,
              dlqExecutions: status.executions.dlq,
              checkedAt: status.timestamp,
            };
          },
          f1Status: (tenantId, windowMinutes) => f1StatusService.getStatus(tenantId, windowMinutes),
          stale: async (tenantId) => {
            const rows = await db
              .select()
              .from(executions)
              .where(and(eq(executions.tenantId, tenantId), eq(executions.status, 'running')))
              .limit(100);
            return { executions: rows, checkedAt: new Date().toISOString() };
          },
          reset: async (tenantId, _actorId, executionId, _body) => {
            const updated = await db
              .update(executions)
              .set({ state: 'queued', status: 'queued', updatedAt: new Date() })
              .where(and(eq(executions.tenantId, tenantId), eq(executions.id, executionId)))
              .returning({ id: executions.id, state: executions.status });
            const row = updated[0];
            return row ? { executionId: row.id, state: row.state, reset: true } : null;
          },
        }),
      inject: [F1StatusService],
    },
  ],
})
export class OpsModule {}
