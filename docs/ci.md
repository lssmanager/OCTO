# CI Pipeline (Issue #89 - F1 Quality Gate)

Required checks for merge to `main`/`develop`:
- lint
- typecheck
- contracts-check
- unit-tests
- python-lint-typecheck
- integration-tests
- python-integration-tests

Main-only release checks:
- docker-build
- docker-scan

## Local commands
- `pnpm f1:workspace-type-gate` — reproducible F1/F2 handoff gate for `@octo/events`, `@octo/database`, `@octo/api`, then full workspace `build` and `typecheck`.
- `pnpm formatcheck`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm contracts:build`
- `pnpm contracts:python`
- `pnpm contracts:check`
- `pnpm contracts:conformance`
- `pnpm contracts:validate`
- `pnpm testunit --coverage`
- `pnpm db:migrate`
- `pnpm testintegration --reporter=verbose`
- `ruff check apps/runtime-worker`
- `mypy apps/runtime-worker --ignore-missing-imports`
- `pytest apps/runtime-worker/tests/ -v --tb=short`

Use real Postgres/Redis for integration checks.
