# F1 Close Gate Report

- Started at (UTC): 2026-06-06T18:35:57Z
- Finished at (UTC): 2026-06-06T18:35:57Z
- Commit SHA: b32055f4f998434e18be4cc900c22f6a15d15c55
- Branch: work
- Gate command: pnpm f1:close-gate
- Environment: node=test; pnpm=11.2.2; docker=unavailable; compose=unavailable
- CI/deploy metadata: CI=false; GITHUB_RUN_ID=unset; COOLIFY_RESOURCE_UUID=unset
- Compose project: default
- Build phase: F1
- Build version: 0.1.0-f1
- Build commit: b32055f
- Build time: 2026-06-06T18:35:57Z

## Verified public URLs

No public URLs were verified before the gate stopped.

## Check results

| Check | Result | Detail |
|---|---|---|
| close tooling available (docker and docker compose) | FAIL | require_close_tooling (exit 1) |
| workspace build/typecheck gate | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| workspace lint | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| API unit tests | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| Agent Graph F1 unit/integration contract | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| scheduler build | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| runtime-worker unit checks | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| F1 naming guard (Agent Graph F1 is not presented as F2 close evidence) | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| anti-stub source scan | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| reset compose stack and volumes for reproducibility | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| start Postgres/Redis for migrations and integration tests | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| database migrations via compose migrate service | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| runtime-worker least-privilege database role smoke | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| integration tests with mandatory DB/Redis | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| tenant isolation gate (API, DB/RLS, queue, scheduler, reclaimer, outbox) | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| observability gate (executionId/traceId reconstruction) | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| compose build for full F1 stack | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| compose up for full F1 stack | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| strict public/API smoke (root, health, metadata, execution, outbox, workers) | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |
| Agent Graph F1 smoke | FAIL | not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL |

## Skip policy

Close mode allows no silent skips. Any required check that fails, cannot run or is not reached is recorded as FAIL. FAST mode is the only mode that may skip optional local feedback, and every FAST skip is logged with an explicit `F1 FAST WARNING: SKIP` label.

## Final decision

FAIL

Failure reason: close tooling available (docker and docker compose) failed with exit 1
