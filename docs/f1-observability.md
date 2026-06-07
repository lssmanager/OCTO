# F1 execution observability runbook

F1 is observable only when an operator can start from an `executionId` or `traceId` and reconstruct API → queue → scheduler → runtime → checkpoints/steps → outbox/timeline → terminal DB state.

## Required commands

```bash
pnpm test:observability
pnpm f1:observability
pnpm f1:close-gate
```

`pnpm f1:close-gate` runs `pnpm test:observability` with real Postgres and Redis. The gate fails if the observable smoke cannot correlate timeline/outbox events by `traceId`/`correlationId`.

## Correlation contract

Every F1 stage must preserve these fields when applicable: `traceId`, `correlationId`, `executionId`, `tenantId`, `agentId`, `workerId`, `queueJobId`, `runId`, `attempt`, `reclaimCount`, and `leaseOwner`. Do not log JWTs, API keys, connection strings, full prompts, or secret values.

## Operator API lookups

Use a tenant-scoped JWT with `ops:read`.

```bash
curl -H "Authorization: Bearer <tenant-ops-token>" \
  "$API_URL/v1/ops/executions/<executionId>/observability"
```

The response includes current execution state, timestamps, worker/queue metadata, attempts, reclaim count, checkpoints, steps, timeline/outbox events, DLQ entries, stuck/reclaimable flags, and log filters.

```bash
curl -H "Authorization: Bearer <tenant-ops-token>" \
  "$API_URL/v1/ops/traces/<traceId>"
```

The trace response lists executions, outbox/timeline events, DLQ entries, queue job references, and the log filter to apply in service logs.

## Coolify staging workflow

1. Capture the `executionId` from the create-execution API response or queue job payload.
2. Capture the `traceId` from the execution row, outbox `_meta.traceId`, or service logs.
3. Query `/v1/ops/executions/:executionId/observability`.
4. Query `/v1/ops/traces/:traceId` and confirm the same execution appears.
5. Filter Coolify logs for `traceId`, `correlationId`, or `executionId` across API, scheduler-worker, runtime-worker, reclaimer-worker, and outbox-publisher-worker.
6. Check queue backlog from `/v1/ops/f1/status` or `queue` in the execution observability response.
7. Check outbox lag from `/v1/ops/f1/status`, `/metrics`, or SQL below.
8. Check DLQ entries in the execution observability response or `/v1/ops/dlq`.
9. If `stuck=true` or `reclaimable=true`, inspect scheduler/reclaimer logs with the same correlation fields.

## SQL fallback queries

Use only staging-safe credentials and keep result sets scoped to the tenant.

```sql
-- Reconstruct execution state.
SELECT id, tenant_id, agent_id, status, run_id, trace_id, queue_job_id,
       worker_id, lease_owner, attempt, reclaim_count, created_at, started_at,
       completed_at, error_code, error_message
FROM executions
WHERE tenant_id = $1 AND id = $2;
```

```sql
-- Timeline by executionId.
SELECT event_type, sequence, payload_json->'_meta' AS meta, published_at,
       dead_lettered_at, created_at
FROM outbox_events
WHERE tenant_id = $1 AND aggregate_type = 'execution' AND aggregate_id = $2
ORDER BY sequence, created_at;
```

```sql
-- Flow by traceId.
SELECT id, aggregate_id AS execution_id, event_type, payload_json->'_meta' AS meta, created_at
FROM outbox_events
WHERE tenant_id = $1
  AND ((payload_json->'_meta'->>'traceId') = $2 OR (payload_json->>'traceId') = $2)
ORDER BY created_at, sequence;
```

```sql
-- Stuck/reclaimable executions.
SELECT id, tenant_id, status, worker_id, lease_owner, lease_expires_at, attempt, reclaim_count
FROM executions
WHERE tenant_id = $1
  AND (status = 'reclaimable' OR (status IN ('queued','dispatched','running') AND lease_expires_at < now()));
```

```sql
-- DLQ by reason.
SELECT reason, count(*)
FROM execution_dlq
WHERE tenant_id = $1
GROUP BY reason
ORDER BY count DESC;
```

```sql
-- Outbox lag.
SELECT count(*) AS unpublished,
       EXTRACT(EPOCH FROM (now() - min(created_at))) * 1000 AS oldest_unpublished_lag_ms
FROM outbox_events
WHERE tenant_id = $1 AND published_at IS NULL AND dead_lettered_at IS NULL;
```

## Metrics / Prometheus signals

F1 exposes or defines operational metrics for execution counts and latencies, queue backlog, reclaim outcomes, DLQ counts, LiteLLM latency/errors/fallbacks, tool calls, checkpoints, and outbox lag/publish failures. Minimum queries:

- `executions_queued`, `executions_running`, `executions_reclaimable`
- `execution_start_latency_ms`, `execution_runtime_duration_ms`, `execution_terminal_latency_ms`
- `queue_waiting_count{queue="execution.dispatch"}`, `queue_active_count`, `queue_failed_count`, `queue_delayed_count`
- `reclaim_candidates_scanned_total`, `reclaim_attempts_total`
- `dlq_count`, `dlq_replay_attempts_total`
- `litellm_requests_total`, `litellm_latency_ms`, `litellm_fallback_total`
- `tool_call_count`, `checkpoint_count`
- `outbox_pending_total`, `outbox_oldest_unpublished_age_ms`, `outbox_publish_failures_total`, `outbox_publish_dlq_total`

## Failure triage

- **API failure:** no execution row or no `ExecutionQueued` event.
- **Queue failure:** execution is `queued`, queue job missing or dispatch backlog grows.
- **Scheduler failure:** no `ExecutionDispatched` event or scheduler heartbeat/logs missing.
- **Runtime failure:** dispatched/running execution lacks `ExecutionStarted`, checkpoints, or terminal event.
- **LiteLLM failure:** runtime logs show LiteLLM error metrics/events and execution has LLM error code.
- **DB/checkpoint failure:** runtime accepted but no checkpoint/step rows appear.
- **Reclaim failure:** stale lease, reclaim count increasing, reclaimer logs/DLQ reason identify max attempts.
- **Outbox failure:** terminal DB state exists but outbox events are unpublished/dead-lettered or lag is high.

## Coolify variables

| Variable | Purpose | Safe example | Consumer |
| --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL for API, workers, migrations, ops queries, and smoke tests. | `postgresql://octo:<password>@postgres:5432/octo_staging` | API/workers/tests |
| `REDIS_URL` | Redis/BullMQ for queues, metrics, scheduler/reclaimer/outbox. | `redis://:<password>@redis:6379` | API/workers/tests |
| `API_URL` | API base URL used by operators/tests. | `https://octo-api-staging.example.invalid` | runbook/tests |
| `RUNTIME_WORKER_URL` | Internal runtime-worker execution endpoint. | `http://runtime-worker:8000/api/v1/execute` | scheduler-worker |
| `INTERNAL_SECRET` | Internal/admin and inter-service authentication. | `32-plus-random-chars` | API/workers |
| `LITELLM_MASTER_KEY` | LiteLLM gateway authentication. | `sk-staging-placeholder` | runtime-worker/LiteLLM |
| `OTEL_ENABLED` | Enable OTEL tracing when collector exists. | `true` | all services |
| `OTEL_SERVICE_NAME` / `OTEL_SERVICE_NAME_WORKER` | OTEL service naming. | `octo-api`, `octo-runtime-worker` | services |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OTLP collector endpoint. | `http://otel-collector:4318` | services |
| `OTEL_EXPORTER_OTLP_HEADERS` | Optional OTLP headers; never log value. | `Authorization=Bearer <redacted>` | services |
| `PROMETHEUS_ENABLED` | Enables metrics scraping path where supported. | `true` | services |
| `OPS_METRICS_WINDOW_MINUTES` | Default ops aggregation window. | `5` | API ops |
| `OUTBOX_STREAM_KEY` | Redis Stream for published outbox events. | `octo.events` | outbox-publisher |
