# F1 Runtime Operational Status

## Public probe-safe endpoints

These endpoints are safe to expose to Docker, Coolify, load balancers, and uptime probes. They must stay minimal and must not include dependency names, queue counts, dependency error strings, heartbeat metadata, build commits, runtime topology, or LiteLLM metadata.

| Service | Endpoint | Public contract |
|---|---|---|
| API | `/api/health/live` | JSON with `status: "ok"` and `timestamp`. |
| API | `/api/health/ready` | JSON with `status: "ok"` or `"not_ready"`, `ready`, and `timestamp`. |
| API | `/api/health/start` | JSON with `status: "ok"` or `"not_ready"`, `ready`, and `timestamp`. |
| Runtime worker | `/health` | JSON with `status: "ok"` and `timestamp`. |
| Runtime worker | `/health/live` | JSON with `status: "ok"` and `timestamp`. |
| Runtime worker | `/health/ready` | JSON with `status: "ok"` or `"not_ready"`, `ready`, and `timestamp`. |
| Scheduler worker | `/health/live` | Plain-text `ok`. |
| Scheduler worker | `/health/ready` | Plain-text `ready` or `not_ready`; returns HTTP 503 when not ready. |

## Internal/authenticated operational endpoints

These endpoints are operational diagnostics and require `X-Internal-Secret` or the API `InternalSecretGuard`. They can contain infrastructure status because they are not public probes.

| Service | Endpoint | Purpose |
|---|---|---|
| API | `/api/health` | Detailed API dependency status. |
| API | `/api/health/ping` | BullMQ health job enqueue check. |
| API | `/api/health/version` | Build metadata. |
| API | `/api/ops/status` | Aggregated build, service, and queue diagnostics. |
| API | `/api/v1/ops/f1/status` | Tenant-scoped F1 operational diagnostics. |
| Runtime worker | `/health/status` | Detailed runtime dependency, database credential selection, and heartbeat evidence. |
| Runtime worker | `/health/worker` | Process-level worker diagnostics. |
| Runtime worker | `/health/version` | Runtime build metadata. |
| Runtime worker | `/health/metrics-url` | Internal Prometheus scrape URL discovery. |
| Scheduler worker | `/health/status` | Scheduler topology and dispatch repair diagnostics. |

## States

| State | Meaning |
|---|---|
| `ok` | Signal is available and within thresholds. |
| `degraded` | Internal diagnostics signal is available, but backlog is high, heartbeat is stale, or a non-critical source is partial. |
| `not_ready` | Public readiness failed because at least one critical dependency is unavailable. Public responses do not name the dependency. |
| `unknown` | Internal diagnostics have no sufficient signal source. This is never treated as healthy. |
| `error` | Internal diagnostics saw an explicit worker or integration error. |
| `not_active` | Reserved topology element that is intentionally not active in F1. |

## Readiness contract

Public liveness endpoints are process-only and should keep returning 200 while the process can answer HTTP.

Public readiness endpoints validate the dependencies needed to safely receive traffic, but they only return the minimal boolean-style contract above. Detailed checks remain available on authenticated ops/internal surfaces.

API readiness validates:

```txt
PostgreSQL
Redis
BullMQ execution.dispatch
LiteLLM readiness
```

Runtime readiness validates:

```txt
PostgreSQL runtime database
Redis
LiteLLM
Control Plane /api/health/live
Runtime process
```

Scheduler readiness validates:

```txt
PostgreSQL
Redis
BullMQ execution.dispatch
Optional runtime worker readiness when RUNTIME_HEALTH_REQUIRED=true
```

If any required check fails, readiness is false and the endpoint returns 503 without dependency details.

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

Heartbeat details are internal-only. They may appear on authenticated ops/status endpoints but must not appear in public health probes.

## Queues

F1 measures only:

```txt
execution.dispatch
```

Queue stats are internal-only. Public probes must not expose waiting, active, failed, delayed, stale, or repaired counts.
