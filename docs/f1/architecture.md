# OCTO F1 Architecture (Operational Closure)

## Dispatch durability

F1 keeps PostgreSQL as the system of record for execution acceptance and treats Redis/BullMQ as repairable coordination.

1. API persists a new execution in `queued` inside PostgreSQL and stores a deterministic `queue_job_id = execution.id`.
2. API still attempts the fast-path `execution.dispatch` enqueue immediately after commit.
3. If the process crashes or Redis fails before `queue.add(...)`, the execution remains durable in PostgreSQL as `queued`.
4. Scheduler-worker runs a queued-dispatch reconciler that scans stale `queued` rows and checks whether BullMQ already has the deterministic dispatch job.
5. Missing or terminal dispatch jobs are re-enqueued idempotently with `jobId = execution.id`.
6. `/health/status` on scheduler-worker exposes the queued-dispatch repair state, including stale count and oldest age.

This means Redis is not a point of permanent loss for accepted executions: any durable `queued` execution is eventually reattached to `execution.dispatch`.

## Reclaim behavior

F1 reclaim uses one canonical replay handoff:

1. Reclaimer detects a zombie execution in `running` with an expired lease.
2. CAS transition moves the execution to `reclaimable` and keeps `status` and `state` synchronized.
3. Reclaimer re-enqueues `execution.dispatch` with the real `tenantId` from `executions.tenant_id`, not from `task`.
4. Scheduler dispatch accepts `reclaimable` only for replay handoff, transitions it to `dispatched`, and invokes the runtime with `mode="reclaim"`.
5. Runtime loads the latest checkpoint, validates lineage, inserts a `reclaim` checkpoint linked to the previous one, and only then resumes execution.
6. If checkpoint lineage is broken, runtime fails the execution terminally with `CHECKPOINT_LINEAGE_BROKEN`.

This keeps reclaim observable, queue-backed, and durable without leaving zombie rows stuck in `retrying`.
