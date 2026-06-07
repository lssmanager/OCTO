# F1 Runtime Write Contract

This file is the human-readable companion to `docs/f1/runtime-write-contract.json`.
F1 intentionally allows `runtime-worker` to persist durable execution progress
straight to PostgreSQL, but only through the least-privilege runtime role and
only for the F1 Runtime Foundation tables below.

## Credential boundary

- `runtime-worker` must use `RUNTIME_DATABASE_URL` in production and F1 close-gate runs.
- `RUNTIME_DATABASE_URL` must authenticate as `RUNTIME_POSTGRES_USER` (default: `octo_runtime`).
- `DATABASE_URL` is reserved for API, migrations and administrative bootstrap.
- The runtime process may use a `DATABASE_URL` fallback only in non-production local tests outside the close gate.

## Allowed tables and privileges

The runtime role may have only `SELECT`, `INSERT` and `UPDATE` on these tables:

- `executions`
- `execution_steps`
- `execution_checkpoints`
- `execution_checkpoint_writes`
- `tool_invocations`
- `approvals`
- `outbox_events`
- `worker_heartbeats`

No extra table is approved by this contract. If a future runtime path needs an
additional table, that need must be justified in a separate issue before F1 can
claim closure for issue #288.

## Forbidden capabilities

The runtime role must not be able to:

- use `SUPERUSER`, `CREATEDB`, `CREATEROLE`, `REPLICATION` or `BYPASSRLS` attributes;
- create tables or temporary tables;
- alter or drop tables;
- read Control Plane tables such as `agents`;
- read migration metadata such as `drizzle.__drizzle_migrations`;
- hold direct or effective table grants outside the allowlist.

## Operational evidence

- `scripts/bootstrap-runtime-db-role.sh` creates/updates the `octo_runtime` role when migrations were not run through the canonical compose `migrate` service.
- `scripts/f1-runtime-db-role-smoke.sh --strict` verifies the positive and negative privilege contract.
- `runtime-worker` exposes `/health/status`, which reports `workerType=runtime-worker`, `phase`, `version`, `commit`, runtime DB connectivity through `RUNTIME_DATABASE_URL`, and latest heartbeat evidence from `worker_heartbeats`.
- `scripts/f1-runtime-handoff-smoke.sh` verifies runtime-worker health/status, direct F1 HTTP handoff acceptance with `202 Accepted`, API runtime worker visibility, and heartbeat evidence without implementing F2 execution features.
