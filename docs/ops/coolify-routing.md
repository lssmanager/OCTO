# Coolify Routing Decision for F1 Public Surface

## Current observed deployment — 2026-06-06

The currently observed Coolify deployment at `https://agents.socialstudies.cloud/` proves that the public `octo-api` control-plane surface is reachable for F1, but it does **not** prove full F1 closure yet.

Observed public metadata:

| Field | Observed value |
|---|---|
| URL | `https://agents.socialstudies.cloud/` |
| Service | `octo-api` |
| Phase | `F1` |
| Version | `0.1.0-f1` |
| Commit | `2be6f23359ef97ef40dc7efe7b6256d17b0ec993` |
| Built at | `local` |
| Environment | `production` |
| Root status | `reachable` |

Observed endpoint results:

| Endpoint | Result | Interpretation |
|---|---|---|
| `/status` | HTTP `404` | Confirms the observed public route is still not the F1 web console/status surface. |
| `/api/health/live` | `status: ok` | API process is alive. |
| `/api/health/version` | `service: octo-api`, `phase: F1`, `version: 0.1.0-f1` | Build metadata is exposed. |
| `/api/health/ready` | `ready: false` | F1 is not ready for closure. |
| readiness `postgres` | `status: ok` | API can reach PostgreSQL. |
| readiness `redis` | `status: ok` | API can reach Redis. |
| readiness `queue` | `status: ok`, `name: execution.dispatch` | API can reach the F1 dispatch queue. |
| readiness `litellm` | `status: error`, `error: This operation was aborted` | LiteLLM is the direct readiness blocker. |
| `/api/v1/ops/f1/status` without `X-Internal-Secret` | `401 Unauthorized` | Expected for protected internal endpoint; must also be validated with the secret. |

This state is documented in `docs/reports/f1-coolify-deployment-status.md`. The close report must remain `FAIL` until the strict close gate passes.

Open blockers derived from this deployment state:

- #286: deploy and validate the complete F1 stack in Coolify, not only API.
- #287: fix LiteLLM readiness.
- #288: validate runtime-worker F1, handoff and runtime DB role.
- #289: validate scheduler/reclaimer/outbox workers and durable dispatch.
- #290: run public Agent Graph smoke against the deployed API.
- #291: validate observability, internal endpoints and F1 security gates.
- #281 remains the umbrella F1 close issue.

F1 must be deployed as **web + API**, not API-only. The canonical F1 public surface is:

- web `/` → **F1 Agent Graph Console**;
- web `/status` → foundation/service status UI;
- API `/api/*` → control-plane API, health and Agent Graph endpoints.

This aligns the deployment contract with `docs/phases/F1.md`: the F1 Agent Graph
System must be visible and operable from a web console while the API remains the
authoritative backend for hierarchy, RBAC, tenant and persistence invariants.

## Required deployable services

| Service | Dockerfile / image | Container port | Required proof | Purpose |
|---|---|---:|---|---|
| `web` | `apps/web/Dockerfile` | `3000` | Public `/`, `/status`, `/api/health` | Public Next.js Agent Graph Console and foundation status UI. |
| `api` | `docker/api.Dockerfile` through `docker-compose.yml` | `3001` | Public `/api/health/*` | `/api/*` control-plane API and health/version endpoints. |
| `postgres` | `postgres:16.6-alpine3.21` | `5432` internal | Compose health plus API readiness `postgres: ok` | F1 system of record. |
| `redis` | `redis:7.4.2-alpine3.21` | `6379` internal | Compose health plus API readiness `redis: ok` and queue `execution.dispatch` | BullMQ queue/cache coordination. |
| `litellm` | pinned `ghcr.io/berriai/litellm` digest | `4000` internal | Compose health plus API readiness `litellm: ok` | Required LLM gateway boundary. |
| `runtime-worker` | `docker/runtime-worker.Dockerfile` | `8000` internal | `/health/ready`, logs or heartbeat | F1 execution worker foundation. |
| `scheduler-worker` | `docker/scheduler-worker.Dockerfile` | `3003` internal | `/health/ready`, logs or heartbeat | Queue consumer and dispatch coordinator. |
| `reclaimer-worker` | `docker/reclaimer-worker.Dockerfile` | `3011` internal | `/health/ready`, logs or heartbeat | Lease/reclaim foundation. |
| `outbox-publisher-worker` | `docker/outbox-publisher-worker.Dockerfile` | `3010` internal | `/health/ready` or logs | Publishes durable outbox events. |
| `migrate` | `docker/migrate.Dockerfile` | n/a | `service_completed_successfully` | One-shot schema/runtime-role migration. |

`docker-compose.yml` is the required F1 Coolify source because it builds and
runs the web/API surfaces, dependencies, LiteLLM, workers and migration job on
the same internal network. The web service uses `API_URL=http://api:3001/api`
inside compose so server-side rendering and the same-origin `/api/agent-graph`
proxy can reach the API without exposing console tokens as `NEXT_PUBLIC_*`
values.

## Routing options

### Option A — one Docker Compose resource (preferred)

Use `docker-compose.yml` as the Coolify resource and route the public domain to
service `web` on port `3000`.

| Setting | Required value |
|---|---|
| Resource type | Docker Compose |
| Compose file | `docker-compose.yml` |
| Forbidden F1 source | root `Dockerfile` / single Dockerfile application |
| Public service | `web` |
| Public web port / Traefik target | `3000` |
| Internal API service | `api` |
| API container port | `3001` |
| Web API base | `API_URL=http://api:3001/api` or `WEB_API_URL=http://api:3001/api` |

If the same hostname must expose API paths, configure the proxy so `/api/*`
reaches `api:3001` and all other paths reach `web:3000`, or let the public web
origin serve the console while API health is validated on its explicit API route.
Do not route the web service to `3001` and do not route the API service to
`3000`.

### Option B — two explicit Coolify resources

Use separate resources only when the routing layer is explicit:

| Host/path | Target | Port |
|---|---|---:|
| `https://agents.socialstudies.cloud/` and `/status` | `web` | `3000` |
| `https://agents.socialstudies.cloud/api/*` or a dedicated API hostname | `api` | `3001` |

The web resource must receive a server-side `API_URL` that points at the API
origin including `/api`. Console tokens such as `OCTO_WEB_CONSOLE_TOKEN` must
remain server-side environment variables and must not use the `NEXT_PUBLIC_`
prefix.

## Expected public results

After deploy:

- `GET /` returns HTTP 200 and renders `Agent Graph Console` plus the
  `F1 · Agent Graph System` marker.
- `GET /` must not contain `Cannot GET /`.
- `GET /status` returns HTTP 200 and renders foundation/service status.
- `GET /api/health/live` returns HTTP 200 while the API process is alive.
- `GET /api/health/ready` returns HTTP 200 only when PostgreSQL, Redis, queue
  and LiteLLM checks are healthy; it may return HTTP 503 during dependency
  outages.
- `GET /api/health/version` returns F1 build metadata with non-`unknown`
  `version`, `commit` and a real UTC `built_at` value in close-gate deployments.
- Worker proof is captured through compose health/logs/heartbeats or
  `pnpm f1:close-gate`; public API liveness alone is not worker evidence.

## Build metadata variables

Configure these non-secret metadata variables for close-gate deploys:

```env
BUILD_PHASE=F1
BUILD_VERSION=<release-or-build-version>
BUILD_COMMIT=<git-sha-or-Coolify-SOURCE_COMMIT>
BUILD_TIME=<ISO-8601-UTC-deploy-time>
```

`SOURCE_COMMIT` may also be supplied by Coolify; the Dockerfiles default
`BUILD_COMMIT` from it when `BUILD_COMMIT` is not explicitly set.

## Public smoke commands

Run these after deployment:

```bash
curl -i https://agents.socialstudies.cloud/
curl -i https://agents.socialstudies.cloud/status
curl -i https://agents.socialstudies.cloud/api/health/live
curl -i https://agents.socialstudies.cloud/api/health/ready
curl -s https://agents.socialstudies.cloud/api/health/version
F1_WEB_URL=https://agents.socialstudies.cloud \
API_URL=https://agents.socialstudies.cloud/api \
API_ROOT_URL=https://agents.socialstudies.cloud \
bash scripts/f1-smoke.sh --health
```

For strict close-gate environments with Docker Compose available, run:

```bash
pnpm f1:close-gate
```

## Port guard

Repository references to `3100` are not part of the F1 deployment contract. For
F1, web listens on `3000` and API listens on `3001`. A Coolify or Traefik label
such as `loadbalancer.server.port=3100` is stale unless a separate, explicitly
documented proxy container actually listens there.

## Reproducibilidad

- La fuente Docker Compose de F1 debe mantener imágenes pinadas; LiteLLM está fijado a `main-v1.61.7` con digest `sha256:0f7f39f40bf6ba4cc802b991ce8c4eb2fa41c8a25b821e1d2d5197229cad27fe`.
- PostgreSQL y Redis usan versiones exactas (`postgres:16.6-alpine3.21`, `redis:7.4.2-alpine3.21`).
- Para actualizar imágenes, seguir `docs/ops/docker-versioning.md`: seleccionar versión, resolver digest, actualizar compose/documentación y ejecutar el close gate.

## Hardening

- Los contenedores F1 propios no ejecutan procesos finales como root.
- Los servicios long-running definen `healthcheck` y `restart: unless-stopped`; `migrate` es la excepción one-shot documentada con `restart: "no"`.
- El compose F1 usa red explícita, volúmenes nombrados mínimos, puertos publicados solo para superficies necesarias, y controles `read_only`, `no-new-privileges`, `cap_drop: ALL` y `tmpfs` en workers.

## Auditoría

Antes de cerrar o promover F1, ejecutar:

```bash
pnpm docker:verify-hardening
pnpm f1:close-gate
```

`f1:close-gate` integra el hardening como control bloqueante y `pnpm docker:verify-hardening` genera `artifacts/f1-hardening-report.md` con imágenes, versiones, digests, health checks, fecha y commit.
