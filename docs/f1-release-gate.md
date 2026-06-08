# F1 Release Gate

`pnpm f1:close-gate` is the only F1 close gate. It is intentionally stricter than compile/deploy success: it validates the live F1 system with real PostgreSQL, Redis, compose services, public web+API HTTP surfaces, Agent Graph F1, observability and runtime database-role evidence before F1 can be called closed.

## Current Coolify evidence — 2026-06-06

The current Coolify deployment at `https://agents.socialstudies.cloud/` is valid partial evidence for F1 but is **not** a passing release gate.

Confirmed:

- Public API root is reachable and reports `OCTO`, service `octo-api`, phase `F1`, version `0.1.0-f1` and commit `2be6f23359ef97ef40dc7efe7b6256d17b0ec993`.
- `/api/health/live` returns `status: ok`.
- `/api/health/version` returns F1 service metadata.
- `/api/health/ready` confirms PostgreSQL, Redis and queue `execution.dispatch` as `ok`.
- `/api/v1/ops/f1/status` returns `401` without `X-Internal-Secret`, which is expected for an internal protected endpoint.

Blocking:

- `/api/health/ready` returns `ready: false` because LiteLLM fails with `This operation was aborted`.
- The observed deployment proves `octo-api` public availability, not the complete F1 stack.
- No public Agent Graph smoke has passed yet against `https://agents.socialstudies.cloud/api`.
- Runtime Worker, Scheduler, Reclaimer, Outbox Publisher, runtime DB role smoke, observability gate and tenant/security gates still need closure evidence.

The detailed evidence is tracked in `docs/reports/f1-coolify-deployment-status.md`. The blocking issues are #286, #287, #288, #289, #290 and #291. Issue #281 remains the umbrella F1 closure ticket.

## Modes

- `pnpm f1:verify` runs `scripts/f1-verify.sh --fast`. FAST mode is for local feedback. It may skip DB/Redis integration checks when `DATABASE_URL`/`REDIS_URL` are absent and may skip Docker smoke unless `F1_VERIFY_DOCKER=1` is set. FAST logs are labelled `F1 FAST`; every allowed skip is an explicit `F1 FAST WARNING: SKIP ...` warning.
- `pnpm f1:close-gate` runs `scripts/f1-verify.sh --close`. CLOSE mode is the release gate. It does not allow silent skips: if a required tool, env, service or check cannot run, the gate records `FAIL` and exits non-zero. If a prerequisite fails before later checks can execute, those later required checks are also reported as `FAIL`/not-run in the close report so the decision cannot be mistaken for a partial PASS.

## Required CLOSE checks

The close gate records each required check in `docs/reports/f1-close-report.md`:

1. Docker and Docker Compose availability.
2. Workspace build/typecheck through `pnpm f1:workspace-type-gate`.
3. Workspace lint through `pnpm lint`.
4. API unit tests and Agent Graph F1 integration contract.
5. Scheduler build and Runtime Worker unit checks.
6. F1 naming guard: F1 gate scripts must not present Agent Graph as an F2 close proof. `scripts/f2-agent-graph-smoke.sh` remains only as a legacy compatibility wrapper.
7. Anti-stub source scan.
8. Clean compose reset and volume removal.
9. Postgres/Redis startup.
10. Database migrations through the compose `migrate` service.
11. Runtime Worker least-privilege database role smoke via `scripts/f1-runtime-db-role-smoke.sh --strict`.
12. DB/Redis integration tests.
13. Tenant isolation tests across API, DB/RLS, queues/workers, scheduler, reclaimer and outbox.
14. F1 observability tests for executionId/traceId reconstruction.
15. Full F1 compose build and compose up.
16. Runtime Worker F1 handoff smoke through `scripts/f1-runtime-handoff-smoke.sh`. This smoke runs from the host after `compose up`, so HTTP checks use the published host ports (`API_URL=http://localhost:3001/api` and `RUNTIME_WORKER_URL=http://localhost:8000`), direct SQL heartbeat verification uses `DATABASE_URL=$F1_HOST_DATABASE_URL`, and Compose services continue using `F1_COMPOSE_*` URLs internally. The runtime-worker container itself must keep using `RUNTIME_DATABASE_URL` with the least-privilege runtime role; the host admin `DATABASE_URL` is only for the smoke's optional direct `worker_heartbeats` read. The smoke validates `/health/live`, `/health/ready`, `/health/status`, `workerType=runtime-worker`, phase `F1`, `database.runtimeDatabaseUrlConfigured=true`, `database.credential=RUNTIME_DATABASE_URL`, HTTP handoff `202 Accepted`, JSON `status=accepted`, API worker visibility and a fresh heartbeat when host-side `psql` is available.
17. Strict public web+API smoke through `scripts/f1-smoke.sh --strict`, including:
    - web `/` is HTTP 200, renders `Agent Graph Console`, contains `F1` / `Agent Graph System`, and does not return `Cannot GET /`;
    - web `/status` is HTTP 200 and renders foundation/service status;
    - web `/api/health` is HTTP 200 for the Next.js service healthcheck;
    - API root remains an operational status surface, contains `OCTO`, does not return `Cannot GET /`, reports phase `F1`, and exposes version/commit/build time coherent with `/api/health/version`;
    - API `/api/health/live`;
    - API `/api/health/ready`;
    - API `/api/health/version`;
    - Runtime Worker, Scheduler, Outbox Publisher and Reclaimer readiness/heartbeats;
    - API → queue → scheduler → runtime → PostgreSQL → outbox → reclaimer execution evidence.

The close gate fails if documentation, compose or smoke disagree about this web+API contract; CLOSE mode must build and start the `web` service and must not silently fall back to an API-only surface.

18. Agent Graph F1 smoke through `scripts/f1-agent-graph-smoke.sh` against `/api/v1/agents/*`, covering JWT rejection for missing credentials, unknown `kid`, bad signature and missing scopes; full `Agency → Department → Workspace → Agent` creation; inherited `effectiveCapabilities`; inherited tool `allow`/`deny` policy projection; rejection of Agent creation through `/nodes`; node detail; patch; activation/archive; valid Department/Workspace/Agent reparent; invalid hierarchy/self-parent/cycle/missing-parent/cross-tenant failures; and selected Agent deletion.

## Lint boundaries and format decision

F1 uses **Option B** for `pnpm lint:boundaries` and `pnpm formatcheck`: they are excluded from `pnpm f1:close-gate` and tracked as separate tooling debt in `docs/reports/f1-tooling-debt.md` and GitHub issue #275.

Rationale: issue #265 defines F1 closure around a live-system gate for build/typecheck, tests, DB/Redis integration, tenant isolation, observability, compose, public smoke, Agent Graph F1, build metadata and runtime DB-role safety. The repository currently has pre-existing formatting/tooling failures, including a Prettier YAML parse failure on environment-template syntax under `infra/grafana/alerting/contact-points.yaml`, plus broad unrelated formatting drift. Those issues should be fixed, but they do not prove whether the F1 live runtime can close. Keeping them outside the close gate prevents style/tooling debt from masking the release-critical runtime evidence while still documenting the debt explicitly.

`pnpm lint` remains blocking in the close gate.

## Report contract

`docs/reports/f1-close-report.md` is generated by close mode. It includes UTC start/end time, commit SHA, branch, gate command, local tool environment, CI/deploy metadata, compose project, build phase/version/commit/time, validated surface decision (`F1 public surface = web+api`), Web URL, Web status URL, API URL, result per required check, skip policy and final decision.

The script only writes `PASS` after every close check has passed. Any failed check writes `FAIL`, records the failing check, marks any unreached required checks as `FAIL`/not-run, and exits non-zero. CLOSE mode has no allowed skips.

## F1/F2 boundary

Agent Graph belongs to F1 for `Agency → Department → Workspace → Agent` persistence, guarded CRUD, hierarchy projection and effective policy/capability projection. Runtime execution beyond the foundation smoke path, streaming responses, flow editing, SubAgent runtime orchestration and F2/F3 execution behavior remain outside F1.

## Actualización #289 — Queue/workers smoke durable

F1 ya no acepta `redis.status=ok`, `queue.status=ok` y `queue.name=execution.dispatch` como evidencia suficiente. El cierre exige `pnpm f1:queue-workers-smoke`, integrado dentro de `pnpm f1:close-gate`, después de `compose up` del stack completo.

El smoke usa URLs publicadas del host (`API_URL`, `RUNTIME_PUBLIC_URL`, `SCHEDULER_PUBLIC_URL`, `OUTBOX_PUBLIC_URL`, `RECLAIMER_PUBLIC_URL`), `DATABASE_URL=$F1_HOST_DATABASE_URL` para SQL desde el host y `REDIS_URL=$F1_HOST_REDIS_URL` para BullMQ desde el host. No usa `F1_COMPOSE_DATABASE_URL` para `psql` host-side.

La validación cubre:

- readiness real de `scheduler-worker`, `reclaimer-worker` y `outbox-publisher-worker`;
- heartbeats frescos en PostgreSQL para scheduler, reclaimer y outbox publisher, de modo que un heartbeat viejo no cuenta como worker vivo;
- visibilidad de workers desde `/api/v1/ops/f1/status`;
- Redis/BullMQ alcanzable con cero jobs fallidos inesperados en `execution.dispatch`;
- creación de ejecución vía API, persistencia durable en PostgreSQL y `queue_job_id = execution.id`;
- job BullMQ con `jobId` determinístico igual al `execution.id`;
- consumo por scheduler y handoff HTTP aceptado por runtime-worker;
- timeline durable y outbox publicado;
- reclaim controlado de una ejecución zombie, re-encolado sin duplicar efectos observables y publicación outbox de reclaim.

PostgreSQL es la fuente de verdad. Redis/BullMQ solo es transporte/coordinación; si PostgreSQL contiene estado durable y BullMQ pierde el job, el reconciliador/worker debe repararlo o el gate falla.


## Verify mode contract

`pnpm f1:verify` is fast by default for local feedback. CI or release wrappers may
set `F1_VERIFY_MODE=close` to require the strict close gate without changing the
package script. Explicit CLI flags are per-invocation overrides and take
precedence (`bash scripts/f1-verify.sh --close|--fast` > `F1_VERIFY_MODE` >
`fast`). Invalid modes fail with exit 64 instead of silently downgrading to fast.

`pnpm f1:close-gate` remains the canonical strict release gate and is equivalent
to invoking the script with `--close`; close mode records any failed or unreached
required check as a failing close report entry.
