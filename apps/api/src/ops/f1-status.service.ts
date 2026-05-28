import { Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { db } from '@octo/database';
import { createQueue, QUEUES, RESERVED_QUEUES } from '@octo/queue';

type WorkerStatus = 'ok' | 'degraded' | 'unknown' | 'error';
type OverallStatus = 'ok' | 'degraded' | 'not_ready';
type QueueStatus = 'ok' | 'degraded' | 'error';

const DEFAULT_WINDOW_MINUTES = 15;
const DEFAULT_HEARTBEAT_STALE_SECONDS = 90;
const DEFAULT_BACKLOG_DEGRADED_THRESHOLD = 100;

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx] ?? null;
}

function asNumber(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}


export function deriveDispatchQueueStatus(waiting: number, threshold: number): 'ok' | 'degraded' {
  return waiting > threshold ? 'degraded' : 'ok';
}

export function calculateF1Rates(input: {
  succeeded: number;
  failed: number;
  cancelled: number;
  reclaimed: number;
  active: number;
  queued: number;
  dlq: number;
}): { successRate: number | null; reclaimRate: number | null; dlqRate: number | null } {
  const terminal = input.succeeded + input.failed + input.cancelled;
  return {
    successRate: terminal > 0 ? input.succeeded / terminal : null,
    reclaimRate: terminal + input.active + input.queued > 0
      ? input.reclaimed / (terminal + input.active + input.queued)
      : null,
    dlqRate: terminal + input.dlq > 0 ? input.dlq / (terminal + input.dlq) : null,
  };
}

function getRows(result: unknown): any[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === 'object' && Array.isArray((result as { rows?: unknown[] }).rows)) {
    return (result as { rows: any[] }).rows;
  }
  return [];
}

@Injectable()
export class F1StatusService {
  async getStatus(tenantId: string, windowMinutes = DEFAULT_WINDOW_MINUTES) {
    const normalizedWindow = Number.isFinite(windowMinutes) && windowMinutes > 0
      ? Math.floor(windowMinutes)
      : DEFAULT_WINDOW_MINUTES;

    const [queue, metrics, workers] = await Promise.all([
      this.getQueueStatus(),
      this.getExecutionMetrics(tenantId, normalizedWindow),
      this.getWorkerHealth(),
    ]);

    return {
      status: this.deriveOverallStatus(queue, workers),
      window: `${normalizedWindow}m`,
      workers,
      queues: {
        executionDispatch: queue,
        executionReclaim: {
          name: RESERVED_QUEUES.EXECUTION_RECLAIM,
          status: 'not_active',
          backlog: 0,
          active: 0,
          reason: 'reserved_for_future_split_no_f1_consumer',
        },
      },
      executions: metrics.executions,
      rates: metrics.rates,
      latencies: metrics.latencies,
      timestamp: new Date().toISOString(),
    };
  }

  private async getQueueStatus(): Promise<{
    name: string;
    status: QueueStatus;
    backlog: number | null;
    active: number | null;
    failed: number | null;
    degradedThreshold?: number;
    reason?: string;
  }> {
    const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
    const threshold = Number(
      process.env['OPS_EXECUTION_DISPATCH_BACKLOG_DEGRADED_THRESHOLD'] ??
      DEFAULT_BACKLOG_DEGRADED_THRESHOLD
    );
    const degradedThreshold = Number.isFinite(threshold)
      ? threshold
      : DEFAULT_BACKLOG_DEGRADED_THRESHOLD;

    const queue = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl });

    try {
      const [waiting, active, failed] = await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getFailedCount(),
      ]);

      const status = deriveDispatchQueueStatus(waiting, degradedThreshold);
      return {
        name: QUEUES.EXECUTION_DISPATCH,
        status,
        backlog: waiting,
        active,
        failed,
        degradedThreshold,
        ...(status === 'degraded' ? { reason: 'backlog_above_threshold' } : {}),
      };
    } catch (err) {
      return {
        name: QUEUES.EXECUTION_DISPATCH,
        status: 'error',
        backlog: null,
        active: null,
        failed: null,
        reason: err instanceof Error ? err.message : String(err),
      };
    } finally {
      await queue.close().catch(() => undefined);
    }
  }

  private async getExecutionMetrics(tenantId: string, windowMinutes: number) {
    const aggregateRows = getRows(await db.execute(sql`
      WITH scoped AS (
        SELECT status, created_at, started_at, completed_at, updated_at, reclaimed_at, reclaim_count
        FROM executions
        WHERE tenant_id = ${tenantId}
          AND COALESCE(updated_at, created_at) >= now() - (${windowMinutes}::int * interval '1 minute')
      ),
      dlq_scoped AS (
        SELECT id
        FROM execution_dlq
        WHERE tenant_id = ${tenantId}
          AND created_at >= now() - (${windowMinutes}::int * interval '1 minute')
      )
      SELECT
        COUNT(*) FILTER (WHERE status IN ('running', 'waiting_tool', 'waiting_human', 'retrying'))::int AS active_executions,
        COUNT(*) FILTER (WHERE status IN ('queued', 'dispatched', 'retry_scheduled'))::int AS queued_executions,
        COUNT(*) FILTER (WHERE status = 'completed')::int AS succeeded_executions,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed_executions,
        COUNT(*) FILTER (WHERE status = 'cancelled')::int AS cancelled_executions,
        COUNT(*) FILTER (WHERE reclaimed_at IS NOT NULL OR reclaim_count > 0 OR status = 'reclaimable')::int AS reclaimed_executions,
        (SELECT COUNT(*)::int FROM dlq_scoped)::int AS dlq_executions
      FROM scoped
    `));

    const row = aggregateRows[0] ?? {};
    const active = asNumber(row.active_executions);
    const queued = asNumber(row.queued_executions);
    const succeeded = asNumber(row.succeeded_executions);
    const failed = asNumber(row.failed_executions);
    const cancelled = asNumber(row.cancelled_executions);
    const reclaimed = asNumber(row.reclaimed_executions);
    const dlq = asNumber(row.dlq_executions);

    const latencyRows = getRows(await db.execute(sql`
      SELECT
        EXTRACT(EPOCH FROM (started_at - created_at)) * 1000 AS dispatch_to_start_ms,
        EXTRACT(EPOCH FROM (completed_at - started_at)) * 1000 AS execution_duration_ms
      FROM executions
      WHERE tenant_id = ${tenantId}
        AND COALESCE(completed_at, updated_at, created_at) >= now() - (${windowMinutes}::int * interval '1 minute')
        AND (
          (created_at IS NOT NULL AND started_at IS NOT NULL)
          OR (started_at IS NOT NULL AND completed_at IS NOT NULL)
        )
      LIMIT 5000
    `));

    const dispatchToStart = latencyRows
      .map((r) => Number(r.dispatch_to_start_ms))
      .filter((v) => Number.isFinite(v) && v >= 0);
    const executionDuration = latencyRows
      .map((r) => Number(r.execution_duration_ms))
      .filter((v) => Number.isFinite(v) && v >= 0);
    return {
      executions: { active, queued, succeeded, failed, cancelled, dlq, reclaimed },
      rates: calculateF1Rates({ succeeded, failed, cancelled, reclaimed, active, queued, dlq }),
      latencies: {
        dispatchToStartP50Ms: percentile(dispatchToStart, 0.5),
        dispatchToStartP95Ms: percentile(dispatchToStart, 0.95),
        executionDurationP50Ms: percentile(executionDuration, 0.5),
        executionDurationP95Ms: percentile(executionDuration, 0.95),
      },
    };
  }

  private async getWorkerHealth() {
    const staleSeconds = Number(
      process.env['OPS_WORKER_HEARTBEAT_STALE_SECONDS'] ?? DEFAULT_HEARTBEAT_STALE_SECONDS
    );
    const normalizedStaleSeconds = Number.isFinite(staleSeconds)
      ? staleSeconds
      : DEFAULT_HEARTBEAT_STALE_SECONDS;

    const rows = getRows(await db.execute(sql`
      SELECT DISTINCT ON (worker_type)
        worker_type,
        instance_id,
        status,
        started_at,
        last_heartbeat_at,
        version,
        commit_sha,
        error
      FROM worker_heartbeats
      ORDER BY worker_type, last_heartbeat_at DESC
    `));

    const byType = new Map<string, any>();
    for (const row of rows) byType.set(String(row.worker_type), row);

    return {
      runtime: this.projectWorker(byType.get('runtime-worker'), normalizedStaleSeconds),
      scheduler: this.projectWorker(byType.get('scheduler-worker'), normalizedStaleSeconds),
      reclaimer: this.projectWorker(byType.get('reclaimer-worker'), normalizedStaleSeconds),
    };
  }

  private projectWorker(row: any | undefined, staleSeconds: number) {
    if (!row) return { status: 'unknown' as WorkerStatus, reason: 'no_heartbeat_source' };

    const lastHeartbeatAt = row.last_heartbeat_at ? new Date(row.last_heartbeat_at) : null;
    const stale = !lastHeartbeatAt || Date.now() - lastHeartbeatAt.getTime() > staleSeconds * 1000;
    const status: WorkerStatus = stale ? 'degraded' : row.status === 'error' ? 'error' : 'ok';

    return {
      status,
      workerType: row.worker_type,
      instanceId: row.instance_id,
      startedAt: row.started_at,
      lastHeartbeatAt: row.last_heartbeat_at,
      version: row.version,
      commitSha: row.commit_sha,
      reason: stale ? 'heartbeat_stale' : row.error ?? undefined,
    };
  }

  private deriveOverallStatus(queue: { status: QueueStatus }, workers: { runtime: { status: WorkerStatus }; scheduler: { status: WorkerStatus }; reclaimer: { status: WorkerStatus } }): OverallStatus {
    if (queue.status === 'error') return 'not_ready';
    const workerStatuses = [workers.runtime.status, workers.scheduler.status, workers.reclaimer.status];
    if (workerStatuses.includes('error')) return 'degraded';
    if (workerStatuses.includes('degraded')) return 'degraded';
    if (workerStatuses.includes('unknown')) return 'degraded';
    if (queue.status === 'degraded') return 'degraded';
    return 'ok';
  }
}
