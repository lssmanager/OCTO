# F1 Release Gate

This gate validates durable execution, replay determinism, checkpoint lineage,
LiteLLM boundary, tenant isolation (API + PostgreSQL RLS + queues/workers),
event/outbox, and tool/MCP constraints.

Implemented by `.github/workflows/ci.yml` jobs, `pnpm arch:check`, and the strict
close command:

```bash
pnpm f1:close-gate
```

Tenant isolation is a mandatory close-gate check. `pnpm f1:close-gate` runs
`pnpm test:tenant-isolation` with real Postgres and Redis before the full F1
smoke test. See `docs/f1-tenant-isolation.md` for local, CI, and Coolify staging
operation.
