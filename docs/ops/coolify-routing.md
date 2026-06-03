# Coolify Routing Decision for F1 Public Surface

Issue #263 is closed as an **API-only F1 deployment** for
`https://agents.socialstudies.cloud/`.

This decision is based on the deployable artifacts that exist in the repository:

- The root `Dockerfile` is the Coolify entrypoint and builds `@octo/api` with
  `turbo prune @octo/api`.
- The root `Dockerfile` exposes API port `3001` and starts the Nest API process.
- `docker-compose.yml` defines an `api` service on container port `3001` and does
  not define a `web` service.
- `apps/web/Dockerfile` exists, but it is a separate Next.js standalone image on
  port `3000`; it is not referenced by the root Coolify Dockerfile or by the F1
  compose stack.
- Repository references to `3100` are not the API container port. For this F1
  API deployment, a Traefik/Coolify label such as
  `loadbalancer.server.port=3100` is stale or incorrect.

## Required Coolify Configuration

For the `agents.socialstudies.cloud` F1 API resource:

| Setting | Required value |
|---------|----------------|
| Resource type | Dockerfile application |
| Dockerfile path | `Dockerfile` |
| Build context | repository root (`/`) |
| Application / Traefik service port | `3001` |
| Expected Traefik label | `loadbalancer.server.port=3001` |
| Runtime command | Dockerfile `CMD` (`node packages/database/dist/migrate.js && node dist/main.js`) |
| Public root URL | `https://agents.socialstudies.cloud/` |
| Public health URLs | `https://agents.socialstudies.cloud/api/health/live`, `/ready`, `/version` |

If Coolify currently shows `loadbalancer.server.port=3100` for this resource,
change it to `3001` before considering F1 closed. Port `3100` must not point at
an API container that listens on `3001`.

## Expected Public Results

After deploy:

- `GET /` returns HTTP 200 and renders the OCTO F1 operational status page.
- `GET /` must not contain `Cannot GET /`.
- `GET /api/health/live` returns HTTP 200 while the API process is alive.
- `GET /api/health/ready` returns HTTP 200 only when PostgreSQL, Redis, queue,
  and LiteLLM checks are healthy; it may return HTTP 503 during dependency
  outages.
- `GET /api/health/version` returns F1 build metadata with non-`unknown`
  `version`, `commit`, and `built_at` values in close-gate deployments.

## Build Metadata Variables

Configure these non-secret metadata variables for close-gate deploys:

```env
BUILD_PHASE=F1
BUILD_VERSION=<release-or-build-version>
BUILD_COMMIT=<git-sha-or-Coolify-SOURCE_COMMIT>
BUILD_TIME=<ISO-8601-UTC-deploy-time>
```

`SOURCE_COMMIT` may also be supplied by Coolify; the Dockerfiles default
`BUILD_COMMIT` from it when `BUILD_COMMIT` is not explicitly set.

## Public Smoke Commands

Run these after deployment:

```bash
curl -i https://agents.socialstudies.cloud/
curl -i https://agents.socialstudies.cloud/api/health/live
curl -i https://agents.socialstudies.cloud/api/health/ready
curl -s https://agents.socialstudies.cloud/api/health/version
API_URL=https://agents.socialstudies.cloud/api \
F1_PUBLIC_URL=https://agents.socialstudies.cloud \
bash scripts/f1-smoke.sh --health
```

For strict close-gate environments with Docker Compose available, run:

```bash
pnpm f1:close-gate
```

## If/When `apps/web` Is Deployed

`apps/web` is not part of the `agents.socialstudies.cloud` API-only F1 resource.
If the product later needs a public web console, create a separate Coolify
resource using `apps/web/Dockerfile` and route it intentionally. That web resource
listens on port `3000` by default and should receive its own domain or an
explicit reverse-proxy rule. Do not reuse the API resource's port `3001`, and do
not set the API resource to `3100` to serve the web console.
