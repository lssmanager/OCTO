# OCTO F1 Architecture (Operational Closure)

## Purpose

This document defines the **current, real** F1 behavior and the closure bar used to determine whether F1 is only implemented (`complete`) or truly operationally closed (`closed`).

## Definitions

- **F1 complete** = kernel funcional implementado.
- **F1 closed** = kernel funcional + operación consistente + CI/deploy + contratos + docs + outbox + no drift crítico.

## Current F1 behavior

F1 runs durable execution with a control-plane/execution-plane split:

1. API/control plane accepts authenticated execution requests and persists canonical execution state.
2. API/scheduler/reclaimer dispatch work to `execution.dispatch`.
3. Runtime worker consumes `execution.dispatch` and executes the agent/model/tool loop.
4. State transitions and checkpoints are persisted durably.
5. Outbox events are written transactionally with state changes, and published asynchronously to the event sink.
6. Ops endpoints expose liveness/readiness/F1 status for runtime operations and SLO monitoring.

## Control plane vs execution plane

- **Control plane**: API endpoints, auth/policy, agent CRUD/versioning, execution creation, initial dispatch, operational endpoints.
- **Execution plane**: runtime worker processing dispatched jobs, model/tool loop execution, lease/heartbeat/retry behavior, durable runtime progress.

## Runtime and PostgreSQL

Runtime touches PostgreSQL as part of durable execution:

- Reads execution and checkpoint lineage.
- Writes execution transitions and execution steps.
- Writes checkpoint state.
- Writes outbox events for operational/domain propagation.

## Tables touched by execution lifecycle

At minimum, F1 lifecycle uses these durable tables:

- `executions`
- `execution_steps`
- `execution_checkpoint_writes`
- `outbox_events`
- `outbox_publish_dlq` (publisher terminal failure path)

## Component responsibilities

| Responsabilidad | API/Control Plane | Runtime Worker | Scheduler | Reclaimer | Outbox Publisher |
|---|---|---|---|---|---|
| Agent CRUD/versioning | sí | no | no | no | no |
| Auth/API policy | sí | no | no | no | no |
| Crear ejecución | sí | no | no | no | no |
| Dispatch inicial | sí | no | sí para schedules | sí para replay | no |
| Ejecutar agent/model/tool loop | no | sí | no | no | no |
| Persistir runtime state | según código | según código | no | no | no |
| Detectar zombies/stuck | no | no | no | sí | no |
| Publicar eventos outbox | no | no | no | no | sí |

## Queue topology (F1)

Canonical queue for execution handoff is:

- `execution.dispatch`

Allowed producers:

- API
- Scheduler worker
- Reclaimer worker (replay/retry)

Primary consumer:

- Runtime worker

`execution.reclaim` is only valid when explicitly active with clear consumer semantics; otherwise it must be treated as non-active/deprecated.

## Scheduler behavior

Scheduler monitors due schedules and dispatches eligible executions to `execution.dispatch` using deterministic job identity where applicable.

## Reclaimer behavior

Reclaimer detects stale/zombie execution leases, applies CAS reclaim semantics, and re-enqueues recovery/replay work to `execution.dispatch`.

## Outbox publisher behavior

Outbox publisher claims unpublished events safely, publishes to sink, marks published only on success, retries with backoff, and moves terminal failures to DLQ with metrics and traceability.

## F1 closure criteria

F1 is considered **closed** only when all of these hold together:

1. Canonical runtime path only (no active legacy routing/engine).
2. Single queue topology for execution dispatch.
3. Ops status reflects real runtime/queue/db/outbox signals.
4. Docker/build/CI wiring is internally consistent.
5. Docs reflect actual runtime behavior.
6. TS/Python contracts have drift detection in CI.
7. Outbox is fully operational end-to-end (write → publish → replay/idempotency/traceability).

## Accepted F1 debt

F1 may still carry non-blocking debt (for example tuning, ergonomics, and future consolidation) as long as it does not break the closure criteria above.

## Future target (F2+)

F2+ should focus on scale and resilience improvements (higher throughput, richer projections, and broader automation), without re-introducing parallel legacy runtime or contract paths.
