# OCTO F1 Architecture (Operational Closure)

## Reclaim behavior

F1 reclaim uses one canonical replay handoff:

1. Reclaimer detects a zombie execution in `running` with an expired lease.
2. CAS transition moves the execution to `reclaimable` and keeps `status` and `state` synchronized.
3. Reclaimer re-enqueues `execution.dispatch` with the real `tenantId` from `executions.tenant_id`, not from `task`.
4. Scheduler dispatch accepts `reclaimable` only for replay handoff, transitions it to `dispatched`, and invokes the runtime with `mode="reclaim"`.
5. Runtime loads the latest checkpoint, validates lineage, inserts a `reclaim` checkpoint linked to the previous one, and only then resumes execution.
6. If checkpoint lineage is broken, runtime fails the execution terminally with `CHECKPOINT_LINEAGE_BROKEN`.

This keeps reclaim observable, queue-backed, and durable without leaving zombie rows stuck in `retrying`.
