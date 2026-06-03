# OCTO F1 Architecture Status (Current Behavior vs Future Target)

## F1 boundary decision

F1 keeps a strict **Control Plane / Execution Plane responsibility boundary**, but it does **not** enforce a strict storage-write boundary yet. The accepted F1 contract is:

- Control Plane (`apps/api`) owns external API surface, authn/authz, tenant policy, execution creation/dispatch and user-facing status endpoints.
- Runtime Worker (`apps/runtime-worker`) owns model/tool execution and writes durable runtime progress directly to PostgreSQL.
- PostgreSQL remains the system of record; Redis/BullMQ is command transport and coordination, not durable truth.
- `DATABASE_URL` is required by runtime execution paths, not just by liveness/readiness probes.

This direct runtime writer is an explicit F1 debt item, not an accidental deployment detail. Control Plane owns external APIs, authn/authz, tenant policy, execution creation/dispatch, scheduling ownership and user-facing status. Runtime Worker owns model/tool execution and writes durable runtime progress directly to PostgreSQL in F1.

## Runtime Worker F1 PostgreSQL write contract

Runtime Worker DB privileges for F1 should be least-privilege and scoped to the following tables.

<!-- runtime-write-contract:start -->
| Table | Runtime operation | Why F1 allows it |
|---|---|---|
| `approvals` | INSERT pending tool approvals. | Human-in-the-loop pauses originate when the runtime hits a governed tool call. |
| `execution_checkpoint_writes` | SELECT writes during reclaim; INSERT tool-result channel writes. | Tool outputs must be replayable from durable checkpoint writes. |
| `execution_checkpoints` | SELECT existing checkpoints during reclaim; INSERT input/reclaim/loop checkpoints. | Checkpoint lineage is the recovery boundary after worker restart or reclaim. |
| `execution_steps` | INSERT the runtime/LLM step; UPDATE step output and completion timestamps. | Step history is part of durable replay/timeline state. |
| `executions` | SELECT ... FOR UPDATE; UPDATE status/state/version, worker ownership, completion/error fields, checkpoints and token usage. | The runtime must claim dispatched work atomically, advance the FSM with CAS semantics and persist terminal state even if the API is not in the hot path. |
| `outbox_events` | SELECT aggregate sequence; INSERT execution/tool lifecycle events. | Events must be committed atomically with state changes and then published by the outbox publisher. |
| `tool_invocations` | INSERT tool attempts; UPDATE validation, timeout, failure, success and approval linkage. | Tool governance/audit state is generated inside the runtime tool executor. |
| `worker_heartbeats` | `INSERT ... ON CONFLICT DO UPDATE` runtime heartbeat rows. | F1 operational status needs durable worker liveness visible to ops/status APIs. |
<!-- runtime-write-contract:end -->

The runtime role must not have broad schema ownership, migration privileges or `BYPASSRLS`. If differentiated database roles are introduced, the runtime role should receive only the table permissions needed above plus sequence/default privileges required by those inserts.

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
- The F1 TypeScript package chain has reproducible filtered and workspace build/typecheck gates (`@octo/contracts -> @octo/events -> @octo/database -> @octo/api`).
- Documentation matches code behavior.
- Legacy contradictory F0/F2 narratives are removed from active docs/comments.

## Accepted F1 debt

- Runtime performs direct PostgreSQL writes for durable progress under the explicit contract above.
- Some ops metrics are derived from DB/queue reads rather than a dedicated metrics backend.
- Worker heartbeat coverage is partial and may report `unknown` where source signals are not yet first-class.

## Future target (F2+ direction, not current behavior)

F2+ should remove or hide the direct runtime writer behind one of these approaches:

1. **Event-sourced execution persistence:** runtime emits append-only facts to a controlled persistence/event interface, and Control Plane projections own table-specific state updates.
2. **Control Plane persistence API:** runtime calls an internal, idempotent API for step/checkpoint/tool/outbox commits, with the API enforcing authorization, schema evolution and least privilege.
3. **Abstract persistence adapter:** runtime code depends on a narrow persistence interface so the F1 direct PostgreSQL adapter can be swapped without rewriting the execution loop.

Any F2+ migration must preserve F1 invariants: atomic state + outbox commits, checkpoint lineage validation, CAS/FSM transitions and replayable tool writes.
