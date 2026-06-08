# CI Pipeline (Issue #89 - F1 Quality Gate)

Required checks for merge to `main`/`develop`:
- Secret Scan (blocking merge/release gate)
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


## Secret Scan blocking gate

The `Secret Scan` workflow is a required blocking gate for merge and release. It must remain enabled for pull requests to `main` and for protected branch pushes; do not bypass it for release candidates.

The gate has three parts:

1. Gitleaks runs with `.gitleaks.toml`, which explicitly uses `[extend] useDefault = true` so OCTO keeps the full built-in Gitleaks ruleset while adding only narrow, documented allowlists.
2. `scripts/verify-secret-scan-gate.sh` performs controlled self-tests: it checks the config inheritance, verifies a clean Docker-history fixture passes, verifies Docker-history fixtures with `TOKEN`/`PASSWORD`/`DATABASE_URL` indicators fail, and verifies a synthetic live-key-shaped fixture is rejected when the Gitleaks CLI is available.
3. `scripts/audit-docker-history-secrets.sh` scans `docker history --no-trunc` for concrete runtime secret names and future variable variants containing `SECRET`, `TOKEN`, or `PASSWORD` before the image can be promoted.

If this gate fails, treat it as a security release blocker. Prefer removing the secret from Git history or Docker build inputs. Add allowlists only when the value is demonstrably a placeholder or header/key name rather than a secret value, and keep each allowlist scoped to the smallest path and line pattern possible.

Local validation:

```bash
pnpm security:secret-scan-gate
```


## F1 security gates restored

- `pnpm f1:verify` defaults to fast local feedback, but `F1_VERIFY_MODE=close` is
  a supported CI/environment source of truth. CLI flags have explicit precedence
  over the environment for one-off overrides: `--close` / `--fast` >
  `F1_VERIFY_MODE` > default `fast`. Invalid modes fail explicitly.
- `pnpm f1:close-gate` always runs the strict close path and records unreached
  required checks as failures in the close report.
- `pnpm contracts:validate` is the contracts CI gate: regenerate JSON Schema,
  regenerate Pydantic models under `apps/runtime-worker/app/contracts/generated`,
  validate Ajv 8 formats (including `date-time`), run TS/Python conformance and
  fail on generated artifact drift.
- `pnpm lint:boundaries` and `pnpm arch:check` enforce the official stack zones
  and block direct provider SDK imports outside `packages/sdk-abstractions`.
- `pnpm testintegration` first verifies that the API integration scope includes
  every `apps/api/src/**/*.integration.test.ts` file, then executes explicit root-relative test file paths to avoid shell-expansion, Vitest filter, or workspace-cwd false greens.

## pnpm release-age gate

F1 uses pnpm's `minimum-release-age=1440` (24 hours) supply-chain gate in
`.pnpmrc`. Any `minimumReleaseAgeExclude` entry in `pnpm-workspace.yaml` must be
version-scoped or family-scoped only for an active security remediation, include
owner, reason and removal date/condition in comments, and must not include React
without a current approved release blocker.

## Local commands
- `pnpm f1:workspace-type-gate` - reproducible F1/F2 handoff gate for `@octo/events`, `@octo/database`, `@octo/api`, then full workspace `build` and `typecheck`.
- `pnpm formatcheck`
- `pnpm lint:boundaries`
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

## Tooling hygiene outside F1 close gate

`pnpm lint:boundaries` and `pnpm formatcheck` are standalone repo hygiene checks. They are intentionally outside `pnpm f1:close-gate` for the F1 live-runtime close decision, but they should remain green before broad refactors or phase handoff work.

- `pnpm lint:boundaries` enforces OCTO architectural zones for internal imports: frontend, control-plane, runtime, workers, UI, agent-core, provider SDK, infra and leaf packages. In particular, frontend must not import runtime/control-plane/infra/agent-core internals, and runtime code must not import frontend/control-plane/UI internals.
- `pnpm formatcheck` verifies repo-wide formatting for source and operational files that Prettier can parse. Generated outputs, build/cache folders, lockfiles, logs and manually wrapped Markdown docs are excluded in `.prettierignore` with explicit comments.

Promotion decision: keep both checks outside `pnpm f1:close-gate` until the team has a stable green baseline. Revisit promotion for F2 by default, or earlier only if F1 stable explicitly accepts adding tooling hygiene to the strict close gate.

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
