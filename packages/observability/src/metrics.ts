import { Counter, Gauge, Histogram, Registry } from 'prom-client';

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

export const queueJobsActive = new Counter({
  name: 'queue_jobs_active',
  help: 'Total queue jobs currently being processed',
  labelNames: ['queue'] as const,
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

// ── Database ──────────────────────────────────────────────────────────
export const dbConnectionUp = new Counter({
  name: 'db_connection_up',
  help: 'Database connection status (1 = up, 0 = down)',
  labelNames: ['database'] as const,
  registers: [metricsRegistry],
});

// ── Redis ─────────────────────────────────────────────────────────────
export const redisConnectionUp = new Counter({
  name: 'redis_connection_up',
  help: 'Redis connection status (1 = up, 0 = down)',
  labelNames: ['instance'] as const,
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

// ── Outbox publisher ───────────────────────────────────────────────────────
export const outboxPendingTotal = new Gauge({
  name: 'outbox_pending_total',
  help: 'Pending unpublished outbox events',
  registers: [metricsRegistry],
});

export const outboxOldestUnpublishedAgeMs = new Gauge({
  name: 'outbox_oldest_unpublished_age_ms',
  help: 'Age in milliseconds of the oldest unpublished outbox event',
  registers: [metricsRegistry],
});

export const outboxPublishLatencyMs = new Histogram({
  name: 'outbox_publish_latency_ms',
  help: 'Outbox event publish latency from database creation to Redis Stream publish',
  buckets: [10, 50, 100, 500, 1000, 5000, 15000, 60000, 300000],
  registers: [metricsRegistry],
});

export const outboxPublishFailuresTotal = new Counter({
  name: 'outbox_publish_failures_total',
  help: 'Total failed outbox publish attempts',
  registers: [metricsRegistry],
});

export const outboxPublishDlqTotal = new Gauge({
  name: 'outbox_publish_dlq_total',
  help: 'Total outbox events moved to publish DLQ',
  registers: [metricsRegistry],
});
