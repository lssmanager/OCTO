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


// ── F1 execution observability ──────────────────────────────────────────────
export const executionsQueued = new Gauge({
  name: 'executions_queued',
  help: 'Current queued/dispatched execution count visible to F1 operators',
  registers: [metricsRegistry],
});

export const executionsRunning = new Gauge({
  name: 'executions_running',
  help: 'Current running execution count visible to F1 operators',
  registers: [metricsRegistry],
});

export const executionsReclaimable = new Gauge({
  name: 'executions_reclaimable',
  help: 'Current reclaimable execution count',
  registers: [metricsRegistry],
});

export const executionsCompletedTotal = new Counter({
  name: 'executions_completed_total',
  help: 'Total completed executions observed by F1 services',
  registers: [metricsRegistry],
});

export const executionsFailedTotal = new Counter({
  name: 'executions_failed_total',
  help: 'Total failed executions observed by F1 services',
  registers: [metricsRegistry],
});

export const executionsCancelledTotal = new Counter({
  name: 'executions_cancelled_total',
  help: 'Total cancelled executions observed by F1 services',
  registers: [metricsRegistry],
});

export const executionStartLatencyMs = new Histogram({
  name: 'execution_start_latency_ms',
  help: 'Execution latency from creation to runtime start',
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 15000, 60000],
  registers: [metricsRegistry],
});

export const executionRuntimeDurationMs = new Histogram({
  name: 'execution_runtime_duration_ms',
  help: 'Runtime duration from started_at to completed_at',
  buckets: [100, 500, 1000, 2500, 5000, 15000, 60000, 300000],
  registers: [metricsRegistry],
});

export const executionTerminalLatencyMs = new Histogram({
  name: 'execution_terminal_latency_ms',
  help: 'Execution latency from creation to terminal state',
  buckets: [100, 500, 1000, 2500, 5000, 15000, 60000, 300000],
  registers: [metricsRegistry],
});

export const queueWaitingCount = new Gauge({
  name: 'queue_waiting_count',
  help: 'BullMQ waiting job count by queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const queueActiveCount = new Gauge({
  name: 'queue_active_count',
  help: 'BullMQ active job count by queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const queueFailedCount = new Gauge({
  name: 'queue_failed_count',
  help: 'BullMQ failed job count by queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const queueDelayedCount = new Gauge({
  name: 'queue_delayed_count',
  help: 'BullMQ delayed job count by queue',
  labelNames: ['queue'] as const,
  registers: [metricsRegistry],
});

export const dispatchJobFailuresTotal = new Counter({
  name: 'dispatch_job_failures_total',
  help: 'Scheduler dispatch job failures',
  registers: [metricsRegistry],
});

export const dispatchJobLatencyMs = new Histogram({
  name: 'dispatch_job_latency_ms',
  help: 'Scheduler dispatch job processing latency',
  buckets: [10, 50, 100, 250, 500, 1000, 5000, 15000, 60000],
  registers: [metricsRegistry],
});

export const reclaimCandidatesScanned = new Counter({
  name: 'reclaim_candidates_scanned_total',
  help: 'Total reclaim candidates scanned',
  registers: [metricsRegistry],
});

export const reclaimAttemptsTotal = new Counter({
  name: 'reclaim_attempts_total',
  help: 'Total reclaim attempts',
  labelNames: ['outcome'] as const,
  registers: [metricsRegistry],
});

export const dlqCount = new Gauge({
  name: 'dlq_count',
  help: 'Current execution DLQ count',
  labelNames: ['reason'] as const,
  registers: [metricsRegistry],
});

export const dlqReplayAttemptsTotal = new Counter({
  name: 'dlq_replay_attempts_total',
  help: 'DLQ replay attempts by outcome',
  labelNames: ['outcome'] as const,
  registers: [metricsRegistry],
});

export const litellmRequestsTotal = new Counter({
  name: 'litellm_requests_total',
  help: 'LiteLLM request count by outcome',
  labelNames: ['outcome'] as const,
  registers: [metricsRegistry],
});

export const litellmLatencyMs = new Histogram({
  name: 'litellm_latency_ms',
  help: 'LiteLLM request latency in milliseconds',
  buckets: [50, 100, 250, 500, 1000, 2500, 5000, 15000, 60000],
  registers: [metricsRegistry],
});

export const litellmFallbackTotal = new Counter({
  name: 'litellm_fallback_total',
  help: 'LiteLLM fallback model attempts',
  registers: [metricsRegistry],
});

export const toolCallCount = new Counter({
  name: 'tool_call_count',
  help: 'Tool call count by outcome',
  labelNames: ['outcome'] as const,
  registers: [metricsRegistry],
});

export const checkpointCount = new Counter({
  name: 'checkpoint_count',
  help: 'Checkpoint writes by source/outcome',
  labelNames: ['source', 'outcome'] as const,
  registers: [metricsRegistry],
});
