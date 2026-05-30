# OCTO F1 Architecture (Operational Closure)

## Canonical dispatch/runtime topology

F1 uses **scheduler-worker as the primary consumer of `execution.dispatch`**. The runtime-worker does not consume BullMQ directly in F1.

1. API accepts an execution by committing a PostgreSQL row in `queued` and an `ExecutionQueued` outbox event.
2. API attempts a fast-path BullMQ enqueue to `execution.dispatch` with deterministic `jobId = execution.id`.
3. Scheduler-worker consumes `execution.dispatch`, owns the dispatch lease, and CAS-transitions `queued` or `reclaimable` executions to `dispatched`.
4. Scheduler-worker invokes runtime-worker over internal HTTP (`POST /api/v1/execute`) with a bounded handoff timeout.
5. Runtime-worker returns `202 Accepted` immediately after validating the internal request and starts the durable execution loop asynchronously inside the runtime process.
6. Runtime-worker owns the model/tool loop and persists runtime progress, checkpoints, terminal status, and outbox events in PostgreSQL.

The HTTP boundary is therefore an **acceptance handoff**, not a synchronous execution request. Long executions are not tied to the scheduler-to-runtime HTTP request lifecycle. Scheduler retries cover failures before runtime acceptance (network errors, 5xx, timeout); runtime failures after acceptance are persisted by the runtime as execution state/outbox events and recovered through lease/reclaim.

## Dispatch durability

F1 keeps PostgreSQL as the system of record for execution acceptance and treats Redis/BullMQ as repairable coordination.

1. API persists a new execution in `queued` inside PostgreSQL and stores a deterministic `queue_job_id = execution.id`.
2. API still attempts the fast-path `execution.dispatch` enqueue immediately after commit.
3. If the process crashes or Redis fails before `queue.add(...)`, the execution remains durable in PostgreSQL as `queued`.
4. Scheduler-worker runs a queued-dispatch reconciler that scans stale `queued` rows and checks whether BullMQ already has the deterministic dispatch job.
5. Missing or terminal dispatch jobs are re-enqueued idempotently with `jobId = execution.id`.
6. `/health/status` on scheduler-worker exposes the queued-dispatch repair state, including stale count, oldest age, dispatcher topology, lease seconds, and runtime HTTP handoff timeout.

This means Redis is not a point of permanent loss for accepted executions: any durable `queued` execution is eventually reattached to `execution.dispatch`.

## Runtime handoff retry semantics

- If scheduler cannot reach runtime, runtime returns non-2xx, or the handoff times out before `202 Accepted`, the BullMQ job fails and BullMQ retry/backoff semantics apply.
- If the first attempt already committed `queued -> dispatched` but failed before observing runtime acceptance, a retry may re-invoke runtime while the execution is still `dispatched`. No second `ExecutionDispatched` event is emitted.
- Duplicate dispatch jobs for executions that have advanced beyond `dispatched` are acknowledged as skipped and do not invoke runtime again.
- If scheduler crashes after runtime accepts but before the BullMQ job is acknowledged, a retry can safely re-invoke while the row is still `dispatched`; runtime claims `dispatched -> running` with CAS, so only one runtime loop proceeds.

## Reclaim behavior

F1 reclaim uses one canonical replay handoff:

1. Reclaimer detects a zombie execution in `running` with an expired lease.
2. CAS transition moves the execution to `reclaimable` and keeps `status` and `state` synchronized.
3. Reclaimer re-enqueues `execution.dispatch` with the real `tenantId` from `executions.tenant_id`, not from `task`.
4. Scheduler dispatch accepts `reclaimable` only for replay handoff, transitions it to `dispatched`, and invokes the runtime with `mode="reclaim"`.
5. Runtime loads the latest checkpoint, validates lineage, inserts a `reclaim` checkpoint linked to the previous one, and only then resumes execution.
6. If checkpoint lineage is broken, runtime fails the execution terminally with `CHECKPOINT_LINEAGE_BROKEN`.

This keeps reclaim observable, queue-backed, and durable without leaving zombie rows stuck in `retrying`.

## Runtime durable write contract

F1 intentionally keeps the Runtime Worker as a direct PostgreSQL writer for durable runtime progress while preserving ownership separation: Control Plane owns external APIs, authn/authz, tenant policy, execution creation/dispatch, scheduling ownership and user-facing status; Runtime Worker owns model/tool execution and writes durable runtime progress directly to PostgreSQL in F1.

The machine-readable source of truth is `docs/f1/runtime-write-contract.json`; the code source of truth is `apps/runtime-worker/src/f1_runtime.py:F1_RUNTIME_DB_WRITE_TABLES`.

<!-- runtime-write-contract:start -->
- `approvals`
- `execution_checkpoint_writes`
- `execution_checkpoints`
- `execution_steps`
- `executions`
- `outbox_events`
- `tool_invocations`
- `worker_heartbeats`
<!-- runtime-write-contract:end -->

No Runtime Worker code may write to Control Plane owned tables such as `agents`, `agent_versions`, `hierarchy_nodes`, `tenant_memberships`, `audit_log`, `idempotency_keys` or `execution_dlq`. F2+ may move this persistence behind event-sourcing, a Control Plane persistence API or a persistence adapter, but F1 keeps the direct writer under the least-privilege `octo_runtime_worker` role.
