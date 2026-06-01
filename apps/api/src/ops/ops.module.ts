import { Module, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { db, executionDlq, executions } from '@octo/database';
import { createQueue, QUEUES } from '@octo/queue';
import { JwtAuthModule } from '../auth/jwt-auth.module';
import { HealthModule } from '../health/health.module';
import { OpsController } from './ops.controller';
import { OpsService } from './ops.service';
import { OpsV1Controller, OpsExecutionController } from './ops-v1.controller';
import { OpsV1Service } from './ops-v1.service';
import { F1StatusService } from './f1-status.service';

function rows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: any[] }).rows;
  }
  return [];
}

function asIso(value: unknown): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : String(value);
}

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
            const [entry] = await db
              .select()
              .from(executionDlq)
              .where(and(eq(executionDlq.tenantId, tenantId), eq(executionDlq.id, jobId)))
              .limit(1);
            if (!entry?.executionId) throw new NotFoundException('DLQ_ENTRY_NOT_FOUND');

            const queue = createQueue(QUEUES.EXECUTION_DISPATCH, {
              redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
            });
            try {
              await queue.add(
                QUEUES.EXECUTION_DISPATCH,
                {
                  tenantId: entry.tenantId,
                  executionId: entry.executionId,
                  reason: 'manual_replay',
                  attempt: Number(entry.attemptsMade ?? 0) + 1,
                  enqueuedAt: new Date().toISOString(),
                },
                { jobId: `requeue:${jobId}`, priority: 1 }
              );
            } finally {
              await queue.close().catch(() => undefined);
            }
            return { jobId, executionId: entry.executionId, requeued: true, targetQueue: QUEUES.EXECUTION_DISPATCH };
          },
          discard: async (tenantId, actorId, jobId, body) => {
            const updated = await db
              .update(executionDlq)
              .set({ resolvedAt: new Date(), resolvedBy: actorId, notes: body.reason, updatedAt: new Date() })
              .where(and(eq(executionDlq.tenantId, tenantId), eq(executionDlq.id, jobId)))
              .returning({ id: executionDlq.id });
            if (!updated.length) throw new NotFoundException('DLQ_ENTRY_NOT_FOUND');
          },
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
          observeExecution: async (tenantId, executionId) => {
            const executionRows = rows(await db.execute(sql`
              SELECT id, tenant_id, agent_id, agent_version_id, status, state, version, run_id, trace_id,
                     queue_job_id, worker_id, lease_owner, attempt, reclaim_count, error_code, error_message,
                     created_at, updated_at, started_at, completed_at, lease_expires_at, reclaimed_at,
                     cancellation_requested_at
              FROM executions
              WHERE tenant_id=${tenantId} AND id=${executionId}
              LIMIT 1
            `));
            const execution = executionRows[0];
            if (!execution) throw new NotFoundException('EXECUTION_NOT_FOUND');

            const [steps, checkpoints, outbox, dlq, queueCounts] = await Promise.all([
              db.execute(sql`
                SELECT id, step_index, step_type, status, trace_id, started_at, ended_at, completed_at,
                       error_code, error_message, duration_ms
                FROM execution_steps
                WHERE tenant_id=${tenantId} AND execution_id=${executionId}
                ORDER BY step_index ASC, started_at ASC
              `),
              db.execute(sql`
                SELECT id, step_index, source, parent_checkpoint_id, worker_id, created_at, schema_version
                FROM execution_checkpoints
                WHERE tenant_id=${tenantId} AND execution_id=${executionId}
                ORDER BY step_index ASC, created_at ASC
              `),
              db.execute(sql`
                SELECT id, event_type, sequence, payload_json, published_at, dead_lettered_at,
                       publish_attempts, last_error, created_at
                FROM outbox_events
                WHERE tenant_id=${tenantId} AND aggregate_type='execution' AND aggregate_id=${executionId}
                ORDER BY sequence ASC, created_at ASC
              `),
              db.execute(sql`
                SELECT id, reason, attempts_made, queue_name, queue_job_id, trace_id, run_id, quarantine,
                       replayed_at, resolved_at, created_at, last_error
                FROM execution_dlq
                WHERE tenant_id=${tenantId} AND execution_id=${executionId}
                ORDER BY created_at DESC
              `),
              (async () => {
                const queue = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
                try {
                  const [waiting, active, failed, delayed] = await Promise.all([
                    queue.getWaitingCount(), queue.getActiveCount(), queue.getFailedCount(), queue.getDelayedCount(),
                  ]);
                  const job = execution.queue_job_id ? await queue.getJob(String(execution.queue_job_id)) : null;
                  return { source: 'bullmq', waiting, active, failed, delayed, job: job ? { id: job.id, state: await job.getState(), attemptsMade: job.attemptsMade, timestamp: job.timestamp, processedOn: job.processedOn, finishedOn: job.finishedOn } : null };
                } catch (error) {
                  return { source: 'bullmq', unavailable: true, reason: error instanceof Error ? error.message : String(error) };
                } finally {
                  await queue.close().catch(() => undefined);
                }
              })(),
            ]);

            const status = String(execution.status);
            const stuck = ['running', 'dispatched', 'queued', 'reclaimable'].includes(status) && execution.lease_expires_at && new Date(execution.lease_expires_at).getTime() < Date.now();
            return {
              execution: {
                id: execution.id,
                tenantId: execution.tenant_id,
                agentId: execution.agent_id,
                agentVersionId: execution.agent_version_id,
                status: execution.status,
                state: execution.state,
                version: execution.version,
                runId: execution.run_id,
                traceId: execution.trace_id,
                queueJobId: execution.queue_job_id,
                workerId: execution.worker_id,
                leaseOwner: execution.lease_owner,
                attempt: Number(execution.attempt ?? 0),
                reclaimCount: Number(execution.reclaim_count ?? 0),
                timestamps: {
                  createdAt: asIso(execution.created_at), updatedAt: asIso(execution.updated_at),
                  startedAt: asIso(execution.started_at), completedAt: asIso(execution.completed_at),
                  leaseExpiresAt: asIso(execution.lease_expires_at), reclaimedAt: asIso(execution.reclaimed_at),
                  cancellationRequestedAt: asIso(execution.cancellation_requested_at),
                },
                error: execution.error_code || execution.error_message ? { code: execution.error_code, message: execution.error_message } : null,
                stuck: Boolean(stuck),
                reclaimable: status === 'reclaimable' || Boolean(stuck),
              },
              queue: queueCounts,
              steps: rows(steps),
              checkpoints: rows(checkpoints),
              timeline: rows(outbox),
              outbox: rows(outbox),
              dlq: rows(dlq),
              sources: { logs: { availableInServiceLogs: true, filterBy: { executionId, traceId: execution.trace_id } } },
            };
          },
          observeTrace: async (tenantId, traceId) => {
            const [execs, events, dlqEntries] = await Promise.all([
              db.execute(sql`
                SELECT id, tenant_id, agent_id, status, state, run_id, trace_id, queue_job_id, worker_id,
                       attempt, reclaim_count, created_at, started_at, completed_at, error_code, error_message
                FROM executions
                WHERE tenant_id=${tenantId} AND trace_id=${traceId}
                ORDER BY created_at ASC
              `),
              db.execute(sql`
                SELECT id, aggregate_id, event_type, sequence, payload_json, published_at, dead_lettered_at, created_at
                FROM outbox_events
                WHERE tenant_id=${tenantId}
                  AND ((payload_json->_meta->>'traceId')=${traceId} OR (payload_json->>'traceId')=${traceId})
                ORDER BY created_at ASC, sequence ASC
              `),
              db.execute(sql`
                SELECT id, execution_id, reason, attempts_made, queue_name, queue_job_id, trace_id, run_id, created_at, resolved_at
                FROM execution_dlq
                WHERE tenant_id=${tenantId} AND trace_id=${traceId}
                ORDER BY created_at ASC
              `),
            ]);
            const executionRows = rows(execs);
            return {
              traceId,
              tenantId,
              executions: executionRows,
              timeline: rows(events),
              outbox: rows(events),
              dlq: rows(dlqEntries),
              queueJobs: executionRows.map((row) => ({ executionId: row.id, queueJobId: row.queue_job_id, workerId: row.worker_id, status: row.status })),
              logs: { availableInServiceLogs: true, filterBy: { traceId } },
              unavailableSources: [],
            };
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
