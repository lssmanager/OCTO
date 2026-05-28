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
          const q = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
          await q.add('dispatch', { tenantId, executionId: jobId, reason: 'manual_replay', attempt: 1, enqueuedAt: new Date().toISOString() }, { jobId: `requeue:${jobId}` });
          await q.close();
          return { jobId, executionId: jobId, requeued: true, targetQueue: QUEUES.EXECUTION_DISPATCH };
        },
        discard: async () => undefined,
        metrics: async (tenantId) => {
          const rows = await db.select({ state: executions.status }).from(executions).where(eq(executions.tenantId, tenantId));
          return { windowSeconds: 300, reclaimRate: 0, successRate: 0, dlqRate: 0, p50LatencyMs: null, p95LatencyMs: null, activeExecutions: rows.filter(r=>r.state==='running').length, queuedExecutions: rows.filter(r=>r.state==='queued').length, failedExecutions: rows.filter(r=>r.state==='failed').length, checkedAt: new Date().toISOString() };
        },

        f1Status: async (tenantId: string, windowMinutes: number) => {
          const since = new Date(Date.now() - windowMinutes * 60_000);
          const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';

          let queueStatus: { status: string; backlog: number | null; active: number | null; reason?: string } = { status: 'unknown', backlog: null, active: null };
          try {
            const q = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl });
            const [waiting, active] = await Promise.all([q.getWaitingCount(), q.getActiveCount()]);
            await q.close();
            queueStatus = { status: 'ok', backlog: waiting, active };
          } catch (e) {
            queueStatus = { status: 'error', backlog: null, active: null, reason: String(e) };
          }

          const rows = await db.select({
            state: executions.status,
            createdAt: executions.createdAt,
            startedAt: executions.startedAt,
            completedAt: executions.completedAt,
            updatedAt: executions.updatedAt,
            leaseOwner: executions.leaseOwner,
          }).from(executions).where(eq(executions.tenantId, tenantId));

          const inWindow = rows.filter((r) => (r.updatedAt ?? r.createdAt) >= since);
          const cnt = (s: string) => rows.filter((r) => r.state === s).length;
          const terminal = cnt('completed') + cnt('failed') + cnt('cancelled') + 0;
          const succeeded = cnt('completed');
          const failed = cnt('failed');
          const dlq = 0;
          const reclaimed = rows.filter((r) => r.state === 'reclaimable' || r.state === 'retrying').length;

          const dispatchToStart = rows
            .filter((r) => r.createdAt && r.startedAt)
            .map((r) => new Date(r.startedAt as any).getTime() - new Date(r.createdAt as any).getTime())
            .filter((v) => Number.isFinite(v) && v >= 0)
            .sort((a, b) => a - b);
          const execDuration = rows
            .filter((r) => r.startedAt && r.completedAt)
            .map((r) => new Date(r.completedAt as any).getTime() - new Date(r.startedAt as any).getTime())
            .filter((v) => Number.isFinite(v) && v >= 0)
            .sort((a, b) => a - b);
          const p = (arr: number[], n: number) => (arr.length ? arr[Math.min(arr.length - 1, Math.floor((arr.length - 1) * n))] : null);

          const runtimeHeartbeat = rows
            .filter((r) => r.leaseOwner)
            .map((r) => r.updatedAt ?? r.startedAt)
            .filter(Boolean)
            .sort((a, b) => +new Date(b as any) - +new Date(a as any))[0] ?? null;

          const staleSec = Number(process.env['OPS_WORKER_HEARTBEAT_STALE_SECONDS'] ?? '90');
          const runtimeFresh = runtimeHeartbeat ? (Date.now() - new Date(runtimeHeartbeat as any).getTime()) <= staleSec * 1000 : false;

          const status = queueStatus.status === 'error' ? 'not_ready' : (runtimeFresh ? 'ok' : 'degraded');

          return {
            status,
            window: `${windowMinutes}m`,
            workers: {
              runtime: { status: runtimeFresh ? 'ok' : 'unknown', lastHeartbeatAt: runtimeHeartbeat, reason: runtimeFresh ? undefined : 'heartbeat_unavailable_or_stale' },
              scheduler: { status: process.env['SCHEDULER_WORKER_URL'] ? 'unknown' : 'unknown', reason: 'no_heartbeat_source' },
              reclaimer: { status: process.env['RECLAIMER_WORKER_URL'] ? 'unknown' : 'unknown', reason: 'no_heartbeat_source' },
            },
            queues: {
              executionDispatch: { name: QUEUES.EXECUTION_DISPATCH, ...queueStatus },
              executionReclaim: { name: QUEUES.EXECUTION_RECLAIM, status: 'unknown', backlog: null, active: null, reason: 'not_active_in_f1_current_topology' },
            },
            executions: {
              active: cnt('running'),
              queued: cnt('queued'),
              succeeded,
              failed,
              dlq,
              reclaimed,
              observedInWindow: inWindow.length,
            },
            rates: {
              successRate: terminal > 0 ? succeeded / terminal : null,
              reclaimRate: rows.length > 0 ? reclaimed / rows.length : null,
              dlqRate: terminal > 0 ? dlq / terminal : null,
            },
            latencies: {
              dispatchToStartP50Ms: p(dispatchToStart, 0.5),
              dispatchToStartP95Ms: p(dispatchToStart, 0.95),
              executionDurationP50Ms: p(execDuration, 0.5),
              executionDurationP95Ms: p(execDuration, 0.95),
            },
            timestamp: new Date().toISOString(),
          };
        },

        stale: async (tenantId) => {
          const rows = await db.select().from(executions).where(and(eq(executions.tenantId, tenantId), eq(executions.status, 'running'))).limit(100);
          return { executions: rows, checkedAt: new Date().toISOString() };
        },
        reset: async (tenantId, _actorId, executionId, _b) => {
          const updated = await db.update(executions).set({ state: 'queued', status: 'queued', updatedAt: new Date() }).where(and(eq(executions.tenantId, tenantId), eq(executions.id, executionId))).returning({ id: executions.id, state: executions.status });
          const row = updated[0];
          return row ? { executionId: row.id, state: row.state, reset: true } : null;
        },
      }),
    },
  ],
})
export class OpsModule {}
