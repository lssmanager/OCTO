# F1 Release Gate

This gate validates durable execution, replay determinism, checkpoint lineage,
LiteLLM boundary, tenant isolation (RLS), event/outbox, and tool/MCP constraints.

Implemented by `.github/workflows/ci.yml` jobs and `pnpm arch:check`.
