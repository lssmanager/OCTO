## Summary

<!-- What does this PR do? Which ADR or phase does it implement? -->

## Type

- [ ] `feat` — New feature or phase implementation
- [ ] `fix` — Bug fix
- [ ] `refactor` — Code refactor without feature change
- [ ] `docs` — Documentation update
- [ ] `test` — Test additions
- [ ] `infra` — Infrastructure / DevOps change
- [ ] `adr` — Architecture Decision Record

## Phase / ADR Reference

<!-- e.g., F0-012, F1, F2 -->

## Checklist

- [ ] `pnpm typecheck` passes
- [ ] `pnpm lint` passes
- [ ] `pnpm build` passes
- [ ] Tests added or updated
- [ ] ADR updated if architectural decision was made
- [ ] No runtime logic in Control Plane (`apps/api`)
- [ ] No orchestration logic in Runtime Worker (`apps/runtime-worker`)
- [ ] No business logic in Frontend (`apps/web`)
- [ ] Observability: trace_id present on new executions
- [ ] No direct SDK imports outside `packages/sdk-abstractions`
