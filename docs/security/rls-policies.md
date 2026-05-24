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

## Transaction rule

Every tenant-scoped query must execute inside the same transaction that sets tenant context.

```sql
BEGIN;
SELECT set_config('app.current_tenant', 'tenant-a', true);
-- tenant-scoped queries here
COMMIT;
```

Do not use session-global tenant setup outside transaction boundaries.

## BYPASSRLS policy

Application and runtime-worker roles must **not** have `BYPASSRLS`.

- Runtime/API users: no bypass.
- Migration role (if privileged): may run migrations, but is not used for business queries.

## Test commands

- `pnpm --filter @octo/database test`
- `pnpm --filter @octo/database typecheck`
- `pnpm --filter @octo/database build`
- `pnpm db:migrate`

For integration tests against real Postgres, set `TEST_DATABASE_URL` (or `DATABASE_URL`).
