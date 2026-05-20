import { Counter, Histogram, Registry } from 'prom-client';

export const metricsRegistry = new Registry();

// ── HTTP ──────────────────────────────────────────────────────────────
export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'route', 'status_code'] as const,
  registers: [metricsRegistry],
});

export const httpRequestDurationMs = new Histogram({
  name: 'http_request_duration_ms',
  help: 'HTTP request duration in milliseconds',
  labelNames: ['method', 'route', 'status_code'] as const,
  buckets: [10, 50, 100, 250, 500, 1000, 2500, 5000],
  registers: [metricsRegistry],
});

// ── Queue ─────────────────────────────────────────────────────────────
export const queueJobsTotal = new Counter({
  name: 'queue_jobs_total',
  help: 'Total queue jobs processed',
  labelNames: ['queue', 'status'] as const,
  registers: [metricsRegistry],
});

export const queueJobsFailedTotal = new Counter({
  name: 'queue_jobs_failed_total',
  help: 'Total queue jobs that failed permanently',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const queueJobDurationMs = new Histogram({
  name: 'queue_job_duration_ms',
  help: 'Queue job processing duration in milliseconds',
  labelNames: ['queue'] as const,
  buckets: [100, 500, 1000, 5000, 15000, 30000, 60000],
  registers: [metricsRegistry],
});

// ── Execution / FSM ───────────────────────────────────────────────────
export const executionLeaseExpiredTotal = new Counter({
  name: 'execution_lease_expired_total',
  help: 'Total execution leases reclaimed by scheduler',
  registers: [metricsRegistry],
});

export const executionTransitionsTotal = new Counter({
  name: 'execution_transitions_total',
  help: 'Total FSM state transitions',
  labelNames: ['from_status', 'to_status'] as const,
  registers: [metricsRegistry],
});

export const executionDlqTotal = new Counter({
  name: 'execution_dlq_total',
  help: 'Total executions moved to DLQ',
  labelNames: ['reason'] as const,
  registers: [metricsRegistry],
});
