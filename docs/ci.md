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

## F1 public deployment smoke

The F1 smoke gate validates that the API is not merely reachable under `/api`, but
also visible as an operational phase surface at the public root URL. `scripts/f1-smoke.sh`
now checks:

- `GET /` returns HTTP 200, contains `OCTO`, and does not contain the Nest fallback
  `Cannot GET /`.
- `GET /api/health/live`, `/api/health/ready`, and `/api/health/version` all respond.
- In strict/close mode, `/api/health/version` reports `phase=F1` and non-`unknown`
  `version`, `commit`, and `built_at` values.

Useful commands:

```bash
API_URL=http://localhost:3001/api bash scripts/f1-smoke.sh --health
F1_PUBLIC_URL=https://agents.socialstudies.cloud bash scripts/f1-smoke.sh --health
pnpm f1:close-gate
```

For issue #263, the public F1 resource is API-only. Coolify/Traefik must route
`https://agents.socialstudies.cloud/` to API container port `3001`; a `3100`
service-port label is stale/incorrect for the API container. See
[`docs/ops/coolify-routing.md`](ops/coolify-routing.md).
