# F1 Runtime Worker Database Role

`octo_runtime` is the PostgreSQL role used by the F1 Runtime Worker when it writes durable execution progress. The canonical deployment bootstrap runs in `packages/database/src/migrate.ts` after Drizzle migrations when `RUNTIME_POSTGRES_PASSWORD` is present. `packages/database/migrations/202605300002_f1_runtime_db_role.sql` keeps the role/grant contract versioned without a hardcoded password, and `scripts/bootstrap-runtime-db-role.sh` is the manual fallback/password-rotation path. The contract is verified by `scripts/check-f1-runtime-contract.py` and `scripts/f1-runtime-db-role-smoke.sh`.

## Role invariants

The role is configured via `RUNTIME_POSTGRES_USER` (default `octo_runtime`) and `RUNTIME_POSTGRES_PASSWORD`; `runtime-worker` connects through `RUNTIME_DATABASE_URL`. `DATABASE_URL` remains reserved for API/migrations/admin bootstrap. The role must always be:

- `LOGIN` only for runtime-worker database connections.
- `NOSUPERUSER`.
- `NOBYPASSRLS`.
- `NOCREATEDB`.
- `NOCREATEROLE`.
- `NOREPLICATION`.
- Without `CREATE` on the database or `public` schema.
- Without direct or effective table privileges outside the F1 runtime write contract, including privileges inherited through `PUBLIC`.
- Without sequence privileges outside sequences owned by the F1 allowlist tables.

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
