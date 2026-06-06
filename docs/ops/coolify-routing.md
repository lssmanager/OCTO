# Coolify Routing Decision for F1 Public Surface

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
