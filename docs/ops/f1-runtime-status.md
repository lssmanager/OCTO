# F1 Runtime Operational Status

## Endpoints

| Endpoint | Purpose |
|---|---|
| `/health/live` | Process liveness. It does not validate external dependencies. |
| `/health/ready` | Real readiness for PostgreSQL, Redis, and the BullMQ `execution.dispatch` queue. |
| `/v1/ops/f1/status` | Tenant-scoped F1 operational diagnostics. |

## States

| State | Meaning |
|---|---|
| `ok` | Signal is available and within thresholds. |
| `degraded` | Signal is available, but backlog is high, heartbeat is stale, or a non-critical source is partial. |
| `not_ready` | Critical dependency is down or the dispatch queue cannot be queried. |
| `unknown` | There is no sufficient signal source. This is never treated as healthy. |
| `error` | The worker explicitly reported an error or the integration failed. |
| `not_active` | Reserved topology element that is intentionally not active in F1. |

## Readiness contract

`/health/live` is process-only and should keep returning 200 while the API process can answer HTTP.

`/health/ready` validates:

```txt
PostgreSQL
Redis
BullMQ execution.dispatch
```

If any of those checks fail, readiness is false and the endpoint should return 503.
LiteLLM remains visible in the readiness payload for diagnosis.

## Worker heartbeats

Workers persist their current process heartbeat in `worker_heartbeats`:

```txt
workerType
instanceId
startedAt
lastHeartbeatAt
status
version
commitSha
metadata
```

A fresh heartbeat is `ok`. A stale heartbeat is `degraded`. A missing heartbeat is `unknown/no_heartbeat_source` and must not be reported as `ok`.

## Formulas

```txt
terminal = completed + failed + cancelled

successRate = completed / terminal

reclaimRate = reclaimed / (terminal + active + queued)

dlqRate = dlq / (terminal + dlq)
```

When a denominator is zero, the rate is `null`.

## Queues

F1 measures only:

```txt
execution.dispatch
```

`execution.reclaim` is reserved, but it is not an active F1 queue with a producer and consumer. It may be returned as `not_active`, but it must not query or reuse `execution.dispatch` statistics.

## Diagnostics

* High backlog in `execution.dispatch`: runtime is not consuming as fast as producers are enqueueing.
* Worker `unknown`: no heartbeat source exists; do not claim operational closure.
* Worker `degraded`: heartbeat is stale or the worker reports a degraded state.
* Worker `error`: the worker is alive but reported an error state.
* Growing DLQ rate: inspect terminal failures and poison messages.

## Performance notes

F1 status metrics use SQL windows instead of tenant-wide in-memory scans. The supporting indexes cover `tenant_id` with `updated_at`, `completed_at`, `started_at`, `reclaimed_at`, and `execution_dlq.created_at`.

`dispatchToStart` currently uses `created_at` as a dispatch proxy. A future improvement should persist an explicit `dispatched_at` timestamp and calculate this latency from that field.
