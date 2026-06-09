# Docker F1 hardening

Images:
- `docker/api.Dockerfile` (3001, `/api/health/live`)
- `docker/runtime-worker.Dockerfile` (8000, `/health/live`)
- `docker/scheduler-worker.Dockerfile` (3003, `/health/live`)
- `docker/outbox-publisher-worker.Dockerfile` (3010, `/health/ready`)
- `docker/reclaimer-worker.Dockerfile` (3011, `/health/ready`)
- `docker/migrate.Dockerfile` (one-shot, `HEALTHCHECK NONE`)

## Network exposure policy

`docker-compose.yml` is the deployable/Coolify compose file. Its default public
surface is intentionally small:

| Service | Host exposure in `docker-compose.yml` | Internal endpoint |
| --- | --- | --- |
| `web` | Public host port `${WEB_PORT:-3000}` | `web:3000` |
| `api` | Public host port `${PORT:-3001}` | `api:3001` |
| `postgres` | Loopback only, `127.0.0.1:${POSTGRES_PORT:-5432}` | `postgres:5432` |
| `redis` | Loopback only, `127.0.0.1:${REDIS_PORT:-6379}` | `redis:6379` |
| `runtime-worker` | **None by default** | `runtime-worker:8000` |
| `scheduler-worker` | Loopback health port only, `127.0.0.1:${SCHEDULER_HEALTH_PORT:-3003}` | `scheduler-worker:3003` |
| `outbox-publisher-worker` | **None by default** | `outbox-publisher-worker:3010` |
| `reclaimer-worker` | **None by default** | `reclaimer-worker:3011` |
| `litellm` | **None by default** | `litellm:4000` |

Runtime/execution-plane services and LiteLLM must not become public surfaces by
accident. The API and scheduler reach them over the internal compose network by
service DNS names. Runtime detailed health, status, version, metrics discovery,
execution and `/models` endpoints require `X-Internal-Secret` matching
`RUNTIME_API_SECRET`; only `/health/live` remains unauthenticated for container
liveness.

## Local infra compose

`docker/compose.dev.yml` is the host-local stores-only compose used for local
application development.

- PostgreSQL, `redis-queue` and `redis-cache` bind only to `127.0.0.1`.
- `POSTGRES_PASSWORD`, `REDIS_QUEUE_PASSWORD`, and `REDIS_CACHE_PASSWORD` are
  required; the file no longer falls back to weak store secrets.
- Local DSNs must include the corresponding password, for example
  `redis://:${REDIS_QUEUE_PASSWORD}@localhost:6380`.

## Local debug override

For host-side smoke tests or one-off local debugging, add the explicit debug
override. It publishes internal services to `127.0.0.1` only:

```bash
docker compose -f docker-compose.yml -f docker-compose.debug.yml up -d \
  api web runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker litellm
```

Use the internal secret when calling protected runtime endpoints from the host:

```bash
curl -H "X-Internal-Secret: $RUNTIME_API_SECRET" http://127.0.0.1:8000/health/ready
curl -H "X-Internal-Secret: $RUNTIME_API_SECRET" http://127.0.0.1:8000/models/
```

Do not use `docker-compose.debug.yml` in Coolify or production deployments.

## Guardrails

- `pnpm compose:network-policy` fails if deployable compose files publish host
  ports for `runtime-worker`, `outbox-publisher-worker`, `reclaimer-worker`,
  `litellm`, Grafana, Prometheus, Loki, or OTLP.
- The same check verifies debug overrides bind only to `127.0.0.1` and that
  Grafana does not regain a default `admin` password.
- CI runs the guardrail in the lint job.

## Local checks

- `pnpm docker:build:f1`
- `pnpm docker:verify-hardening`
- `pnpm docker:smoke:f1-images`
- `pnpm docker:verify:f1-images`
- `pnpm compose:network-policy`
- `trivy image --exit-code 1 --severity HIGH,CRITICAL octo/api:sha-local`
- `syft octo/api:sha-local -o cyclonedx-json > sbom-api.json`

## Tags

- `sha-<git_sha>` immutable
- `pr-<pr_number>` on PR
- `latest` only on main

## Signing

Main branch can sign with Cosign when `COSIGN_KEY` and `COSIGN_PASSWORD` secrets exist.
