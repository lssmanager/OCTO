# F1 Tenant Isolation with PostgreSQL RLS

PostgreSQL RLS is the final tenant isolation boundary for F1.

## Tenant-scoped tables

- agents
- agent_versions
- executions
- execution_steps
- execution_checkpoints
- execution_checkpoint_writes
- tool_invocations
- approvals
- outbox_events

## Policy pattern

Each table enforces:

- `USING (...)` for reads
- `WITH CHECK (...)` for writes

with this predicate shape:

```sql
tenant_id = current_setting('app.current_tenant', true)
AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
```

This intentionally denies access when tenant context is missing or empty.

## Why missing/empty tenant context denies access

- If `app.current_tenant` is not set, `current_setting(..., true)` resolves to `NULL`, so the tenant predicate does not match rows.
- If it is set to an empty string, the `COALESCE(..., '') <> ''` guard fails.
- Because the same predicate is in `WITH CHECK`, wrong-tenant or empty-tenant writes are blocked too.

## Transaction rule

Every tenant-scoped query must execute inside the same transaction that sets tenant context.

```sql
BEGIN;
SELECT set_config('app.current_tenant', 'tenant-a', true);
-- tenant-scoped queries here
COMMIT;
```

Do not use session-global tenant setup outside transaction boundaries.

## Safe application pattern

Use a transaction helper that wraps DB access and sets tenant context before business queries:

```sql
SELECT set_config('app.current_tenant', $1, true)
```

`$1` must be parameterized (no SQL string concatenation).

## BYPASSRLS policy

API/application/runtime-worker roles must **not** have `BYPASSRLS`.

- Runtime/API users: no bypass.
- Internal workers: tenant-aware and transaction-scoped.
- Migration/admin role (if privileged): only for migrations/admin operations and not used for runtime business queries.

### Deliberate deviation from issue #63 historical wording

Issue #63 historically mentioned `ALTER ROLE octo_service BYPASSRLS`.
This implementation intentionally does **not** grant `BYPASSRLS` to runtime/app roles to preserve F1 tenant isolation invariants and ADR-F1-005.

## How to run RLS checks

- `pnpm --filter @octo/database test`
- `pnpm --filter @octo/database typecheck`
- `pnpm --filter @octo/database build`
- `pnpm db:migrate`

For integration tests against real Postgres, set `TEST_DATABASE_URL` (or `DATABASE_URL`).
