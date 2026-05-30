# F1 Runtime Worker Database Role

`octo_runtime_worker` is the PostgreSQL role used by the F1 Runtime Worker when it writes durable execution progress. The role is enforced by `packages/database/migrations/202605300002_f1_runtime_db_role.sql` and verified by `scripts/check-f1-runtime-contract.py`.

## Role invariants

The role must always be:

- `LOGIN` only for runtime-worker database connections.
- `NOSUPERUSER`.
- `NOBYPASSRLS`.
- `NOCREATEDB`.
- `NOCREATEROLE`.
- `NOREPLICATION`.
- Without `CREATE` on the database or `public` schema.
- Without table grants outside the F1 runtime write contract.

## Allowed grants

The role receives only `SELECT`, `INSERT` and `UPDATE` on the F1 runtime durable-progress tables below. It receives no `DELETE`, `TRUNCATE`, `REFERENCES` or `TRIGGER` grants.

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

## Prohibited tables

The runtime role must not receive grants on Control Plane owned tables. Examples that must remain prohibited for runtime writes include:

- `agents`
- `agent_versions`
- `audit_log`
- `execution_dlq`
- `hierarchy_nodes`
- `idempotency_keys`
- `tenant_memberships`

## Ownership boundary

Control Plane owns external APIs, authn/authz, tenant policy, execution creation/dispatch, scheduling ownership and user-facing status. Runtime Worker owns model/tool execution and writes durable runtime progress directly to PostgreSQL in F1. This is the F1 direct PostgreSQL boundary for runtime durability.

F2+ may move this persistence behind event-sourcing, a Control Plane persistence API or a persistence adapter, but F1 keeps the direct writer with the enforced least-privilege role above.
