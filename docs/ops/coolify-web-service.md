# Coolify Web Service Runbook for F1

## Objective

Expose the F1 public surface through the `web` service from `docker-compose.yml`.
For F1, Coolify must publish the Next.js console on `web:3000`, not the API
container on `api:3001`.

This runbook is the operational companion to:

- `docker-compose.yml`
- `docs/ops/coolify-routing.md`
- `docs/ops/coolify-secrets.md`

## Expected F1 topology

The canonical F1 Docker Compose resource must contain these services:

- `web`
- `api`
- `postgres`
- `redis`
- `litellm`
- `runtime-worker`
- `scheduler-worker`
- `reclaimer-worker`
- `outbox-publisher-worker`
- `migrate`

Public traffic must resolve like this:

- `/` -> `web:3000`
- `/status` -> `web:3000`
- `/api/*` -> API surface, either same host path-routed to `api:3001` or a dedicated API host

## When this runbook applies

Use this procedure when any of these are true:

- Coolify is deploying OCTO from the root `Dockerfile`
- the deployed resource only shows `api` and not `web`
- the public root returns API output or `Cannot GET /`
- Coolify shows domains for workers and API, but no domain for `web`

If any of those happen, the deployment is still API-only and does not prove F1 closure.

## Coolify procedure

### Option A: create a new Docker Compose resource

Preferred when the current OCTO resource was created as a single Dockerfile app.

1. In Coolify, create a new resource from the OCTO repository.
2. Select `Docker Compose` as the resource type.
3. Set the compose source file to `docker-compose.yml`.
4. Select the branch to deploy.
5. Save the resource.
6. Confirm Coolify detects these services after parsing compose:
   - `web`
   - `api`
   - `postgres`
   - `redis`
   - `litellm`
   - `runtime-worker`
   - `scheduler-worker`
   - `reclaimer-worker`
   - `outbox-publisher-worker`
   - `migrate`

### Option B: replace the current API-only resource

Use this only if the existing Coolify resource can be safely reconfigured.

1. Open the current OCTO resource.
2. Change the source type from single `Dockerfile` to `Docker Compose`.
3. Point it to `docker-compose.yml`.
4. Save and let Coolify re-parse the services.
5. Verify that `web` appears as a service before deploying.

## Required domain assignment

After Coolify loads the compose services:

1. Open the `web` service.
2. Add the primary public domain to `web`.
3. Make sure the target port is `3000`.
4. Do not publish the primary public host from `api:3001`.

Recommended public shape:

- primary host: `https://agents.socialstudies.cloud/` -> `web:3000`
- optional API host: `https://api.agents.socialstudies.cloud/` -> `api:3001`

If the same host must serve both UI and API, route `/api/*` to `api:3001` and
all other paths to `web:3000`.

## Required environment values

The compose file already wires `web` correctly. Coolify must inject the runtime
variables, not build-time secrets.

Minimum values to confirm for the `web` path:

```env
WEB_PORT=3000
WEB_API_URL=http://api:3001/api
WEB_RUNTIME_WORKER_URL=http://runtime-worker:8000
```

Minimum values to confirm for the platform:

```env
POSTGRES_PASSWORD=<required>
REDIS_PASSWORD=<required>
JWT_SECRET=<required>
INTERNAL_SECRET=<required>
LITELLM_MASTER_KEY=<required>
RUNTIME_POSTGRES_PASSWORD=<required>
```

Do not place secrets in Coolify Build Variables.

## What success looks like

After deployment, all of these should be true:

1. Coolify shows a `web` service in the compose resource.
2. The public root loads the Next.js F1 console instead of the API root.
3. `GET /status` returns the foundation status UI.
4. `GET /api/health/live` returns API liveness.
5. `GET /api/health/ready` reflects dependency readiness.

## Verification commands

```bash
curl -i https://agents.socialstudies.cloud/
curl -i https://agents.socialstudies.cloud/status
curl -i https://agents.socialstudies.cloud/api/health/live
curl -i https://agents.socialstudies.cloud/api/health/ready
curl -s https://agents.socialstudies.cloud/api/health/version
```

For strict F1 evidence:

```bash
F1_WEB_URL=https://agents.socialstudies.cloud \
API_URL=https://agents.socialstudies.cloud/api \
API_ROOT_URL=https://agents.socialstudies.cloud \
bash scripts/f1-smoke.sh --health
```

## Quick diagnosis

| Symptom | Diagnosis | Corrective action |
|---|---|---|
| Coolify shows domains for `api`, `runtime-worker`, `scheduler-worker`, `reclaimer-worker`, `outbox-publisher-worker`, `litellm`, but no `web` | Resource is not exposing the F1 public service | Recreate or reconfigure the resource as Docker Compose from `docker-compose.yml` and assign the public domain to `web:3000` |
| Public root responds from NestJS | Public host is still attached to `api` | Move the primary domain to `web` |
| `/status` returns `404` | Web console is not the public surface | Publish `web` and re-check routing |
| `web` exists but cannot load Agent Graph data | Internal API URL is wrong | Confirm `WEB_API_URL=http://api:3001/api` |
| `api/health/ready` is unhealthy | Dependency or worker readiness issue remains | Fix the failing readiness dependency before claiming F1 closure |

## Non-goal

This runbook does not close F1 by itself. It only fixes the public deployment shape
required for F1. The release is closed only when the remaining runtime, worker,
LiteLLM, security and close-gate evidence also pass.
