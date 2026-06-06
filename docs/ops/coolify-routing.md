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

F1 is deployed as **web + API**, not API-only. The canonical F1 public surface is:

- web `/` → **F1 Agent Graph Console**;
- web `/status` → foundation/service status UI;
- API `/api/*` → control-plane API, health and Agent Graph endpoints.

This aligns the deployment contract with `docs/phases/F1.md`: the F1 Agent Graph
System must be visible and operable from a web console while the API remains the
authoritative backend for hierarchy, RBAC, tenant and persistence invariants.

## Required deployable services

| Service | Dockerfile | Container port | Purpose |
|---|---|---:|---|
| `web` | `apps/web/Dockerfile` | `3000` | Public Next.js Agent Graph Console and `/status` UI. |
| `api` | `docker/api.Dockerfile` through `docker-compose.yml` | `3001` | `/api/*` control-plane API and health/version endpoints. |

`docker-compose.yml` is the preferred F1 Coolify source because it builds and
runs both services on the same internal network. The web service uses
`API_URL=http://api:3001/api` inside compose so server-side rendering and the
same-origin `/api/agent-graph` proxy can reach the API without exposing console
tokens as `NEXT_PUBLIC_*` values.

## Routing options

### Option A — one Docker Compose resource (preferred)

Use `docker-compose.yml` as the Coolify resource and route the public domain to
service `web` on port `3000`.

| Setting | Required value |
|---|---|
| Resource type | Docker Compose |
| Compose file | `docker-compose.yml` |
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
  `version`, `commit` and `built_at` values in close-gate deployments.

## LiteLLM readiness wiring for issue #287

F1 keeps LiteLLM as a separate service on the internal `octonet` network. The API
must point to that service name and port; it must not call an LLM provider SDK or a
public provider URL directly.

Runtime environment variables for the API service:

| Variable | Required F1 value | Notes |
|---|---|---|
| `LITELLM_BASE_URL` | `http://litellm:4000` unless Coolify renames the compose service | Internal service URL used by `octo-api`; do not point it at OpenAI/Anthropic/etc. |
| `LITELLM_MASTER_KEY` | Coolify Environment Variable | Secret runtime env only; never a build arg. |
| `LITELLM_HEALTH_ENDPOINT` | `/health/readiness` (default) | Checks that the LiteLLM proxy can receive traffic. `/health/liveliness` is process-only. |
| `LITELLM_HEALTH_TIMEOUT_MS` | `5000` (default; max 10000) | Avoids false failures from LiteLLM cold start or transient internal-network latency. |
| `OPENAI_API_KEY` | Valid provider key, or an explicitly controlled F1 test key only for non-production smoke | Inject into the LiteLLM service as runtime env. Do not pass provider secrets to the API build. |

The LiteLLM compose service is declared in `docker-compose.yml` and mirrored in
`docker-compose.f1.yml`, uses the pinned
`ghcr.io/berriai/litellm:main-v1.61.7@sha256:0f7f39f40bf6ba4cc802b991ce8c4eb2fa41c8a25b821e1d2d5197229cad27fe`
image, mounts `docker/litellm/config.yaml`, and exposes port `4000` only as the
LiteLLM gateway. Its Docker healthcheck uses `/health/readiness` with a 30s
`start_period`; if production startup timing exceeds that, capture the first
successful readiness latency before changing the value. The API readiness payload
should show `checks.litellm.status: ok`, `endpoint: /health/readiness`,
`latencyMs`, and LiteLLM metadata such as `upstreamStatus`, `db`, or
`litellmVersion` when the proxy returns JSON. If LiteLLM returns HTTP 200 with
metadata like `status: disconnected` or `db: Not connected`, OCTO treats that as
unhealthy because F1 uses LiteLLM database-backed auth/config.

Internal validation from the API/LiteLLM network after deployment:

```bash
# from the API container, or any container attached to the same compose network
curl -fsS http://litellm:4000/health/readiness

# public API close-gate evidence
curl -fsS https://agents.socialstudies.cloud/api/health/ready
```

If public readiness still reports `litellm.error: timeout after ...ms`, check in
this order: LiteLLM container health, service name/DNS (`litellm:4000`), internal
network attachment, `LITELLM_MASTER_KEY`, provider key injection in the LiteLLM
container, and PostgreSQL connectivity for LiteLLM's `DATABASE_URL`.

This is an F1 operational fix only. Do not add direct provider SDK bypasses,
advanced routing, active-active provider balancing, tenant virtual-key routing,
or F9 fallback behavior while resolving #287.

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
