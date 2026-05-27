# OCTO F1 Architecture Status (Current Behavior vs Future Target)

## Contradiction inventory (resolved in this update)

| File | Previous text/idea | Problem | Action |
|---|---|---|---|
| `apps/runtime-worker/src/execution/__init__.py` | "This module NEVER writes to Postgres directly" | Contradicted F1 runtime behavior (runtime code persists execution state directly). | Replaced with current-state note + explicit F2+ future-direction note. |
| `apps/runtime-worker/src/config.py` | "runtime-worker reads DB only for health checks" | Contradicted current runtime persistence paths. | Rewrote database comment to reflect F1 direct DB writes and control-plane boundaries. |
| `README.md` | No explicit complete/closed distinction for F1 behavior | Encouraged ambiguity about what is implemented vs operationally closed. | Added explicit "Current F1 behavior", boundaries table, and definitions for F1 complete vs F1 closed. |

## Current F1 behavior

- Control Plane (`apps/api`) owns external API surface, authn/authz, tenant policy, execution creation/dispatch and user-facing status endpoints.
- Runtime Worker (`apps/runtime-worker`) owns model/tool execution and durable runtime progress persistence.
- In current F1, runtime worker persists execution progress directly to PostgreSQL (for transitions, steps, checkpoints and recovery continuity).
- Scheduler Worker (`apps/scheduler-worker`) owns scheduled dispatch and queue-driven dispatch orchestration.
- Reclaimer Worker (`apps/reclaimer-worker`) owns stale/zombie detection and replay/retry decisions.

## Control Plane vs Execution Plane boundaries

| Responsibility | Control Plane | Execution Plane / Runtime |
|---|---:|---:|
| Agent CRUD/versioning | Yes | No |
| AuthN/AuthZ and tenant policy | Yes | No |
| Create execution records and dispatch commands | Yes | No |
| Run model/tool loop | No | Yes |
| Persist runtime progress/checkpoints | Shared durable store | Yes (current F1 writer) |
| Stuck/zombie reclaim decisions | No | Reclaimer worker |
| Scheduled due-job detection | Scheduler worker | No |
| User-facing HTTP APIs | Yes | Internal-only endpoints |

## F1 Complete (objective definition)

F1 is **complete** when the durable execution kernel is functionally implemented and runs real jobs via the canonical F1 path.

Minimum criteria:

- Control plane can create and dispatch executions.
- Runtime worker can execute canonical F1 runtime path.
- Execution state is persisted durably.
- Steps/checkpoints/tool invocations are recorded for recovery.
- Scheduler and reclaimer responsibilities are implemented in code.

## F1 Closed (objective definition)

F1 is **closed** only when functional implementation is also operationally coherent and maintainable.

Minimum criteria:

- Canonical runtime and queue topology are enforced.
- Ops/runtime status exposes real operational metrics (not placeholders).
- Docker/CI/deployment paths are consistent.
- TS/Python contracts are synchronized or guarded against drift.
- Documentation matches code behavior.
- Legacy contradictory F0/F2 narratives are removed from active docs/comments.

## Accepted F1 debt

- Runtime currently performs direct PostgreSQL writes for durable progress.
- Some ops metrics are derived from DB/queue reads rather than a dedicated metrics backend.
- Worker heartbeat coverage is partial and may report `unknown` where source signals are not yet first-class.

## Future target (F2+ direction, not current behavior)

- Event-sourced persistence-only runtime boundaries.
- Expanded orchestration engines (e.g., advanced graph orchestration) beyond F1 kernel scope.
- Dedicated metrics backend for richer p95/p99 and cross-service heartbeat correlation.
