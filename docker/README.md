# OCTO Docker Architecture

Every OCTO service runs as an **independent container** with its own restart domain, health probe, and environment scope. This is not a monolith — do not run workers inside the API process.

## Service Port Map

| Service | Package | Port | Dockerfile | Coolify |
|---|---|---|---|---|
| `api` | `@octo/api` | `3001` | `Dockerfile` (root) | ✅ Deployed |
| `runtime-worker` | `@octo/runtime-worker` | `3002` | `docker/runtime-worker/Dockerfile` | 🔴 Register |
| `scheduler-worker` | `@octo/scheduler-worker` | `3003` | `docker/scheduler-worker/Dockerfile` | 🔴 Register |
| `embedding-worker` | `@octo/embedding-worker` | `3004` | `docker/embedding-worker/Dockerfile` | 🔴 Register |
| `memory-worker` | `@octo/memory-worker` | `3005` | `docker/memory-worker/Dockerfile` | 🔴 Register |
| `channel-discord-worker` | `@octo/channel-discord-worker` | `3006` | `docker/channel-discord-worker/Dockerfile` | 🔴 Register |
| `channel-telegram-worker` | `@octo/channel-telegram-worker` | `3007` | `docker/channel-telegram-worker/Dockerfile` | 🔴 Register |
| `channel-whatsapp-worker` | `@octo/channel-whatsapp-worker` | `3008` | `docker/channel-whatsapp-worker/Dockerfile` | 🔴 Register |

## Registering a Worker in Coolify

For each 🔴 worker above, repeat:

1. **Coolify → New Resource → Application → GitHub → `lssmanager/OCTO`**
2. **Build Pack:** `Dockerfile`
3. **Dockerfile location:** e.g. `docker/runtime-worker/Dockerfile`
4. **Build context:** `/` (repo root — required for `turbo prune`)
5. **Exposed port:** set to the port in the table above
6. **Network:** add to `openclawnet` (same network as `api`, Postgres, Redis)
7. **Environment Variables → Runtime** (⚠️ NOT Build-time):

```env
# All workers
DATABASE_URL=postgresql://user:pass@host:5432/octo
REDIS_URL=redis://host:6379
NODE_ENV=production
OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4318
OTEL_SERVICE_NAME=runtime-worker     # change per service

# Execution workers (runtime, embedding, memory, scheduler)
WORKER_CONCURRENCY=4

# memory-worker only
QDRANT_URL=http://qdrant:6333

# channel-discord-worker only
DISCORD_TOKEN=...

# channel-telegram-worker only
TELEGRAM_BOT_TOKEN=...

# channel-whatsapp-worker only
WHATSAPP_TOKEN=...
```

> ⚠️ **SECURITY — CRITICAL**: All secrets must be set under **Runtime** environment variables in Coolify — NEVER under Build-time. Build-time variables are baked into image layer history and can be extracted with `docker history --no-trunc` (MITRE ATT&CK T1552.007).

## Health Endpoints

Every service exposes two endpoints:

| Endpoint | Purpose | Used by |
|---|---|---|
| `GET /health/live` | Process is alive | Coolify `HEALTHCHECK` |
| `GET /health/ready` | Queue + DB connections verified | Readiness probe |

The `api` service prefixes with `/api/`: `GET /api/health/live`.

Coolify's HEALTHCHECK polls `/health/live`. If it fails, the container restarts. A healthy `/health/live` with a broken queue connection will NOT trigger a restart — that's what `/health/ready` is for.

## Dockerfile Build Pattern

All Dockerfiles use the same 4-stage turbo-prune pattern:

```
base → pruner (turbo prune @octo/<service>) → builder (pnpm install + build) → runner
```

The only differences between Dockerfiles:
- `turbo prune @octo/<service-name>` in the pruner stage
- `COPY apps/<service-name>/dist` in the runner stage  
- `EXPOSE <port>` and `HEALTHCHECK` URL
- `WORKER_CONCURRENCY` default value in `ENV`

## Network Topology

```
            ┌──────────────────────────────┐
            │        openclawnet           │
            │                              │
  internet ──► api:3001                    │
            │    │                         │
            │    ├──► runtime-worker:3002  │
            │    ├──► scheduler-worker:3003│
            │    ├──► embedding-worker:3004│
            │    └──► memory-worker:3005   │
            │                              │
  channels ──► discord-worker:3006         │
            ├──► telegram-worker:3007      │
            └──► whatsapp-worker:3008      │
                                           │
            │  postgres:5432               │
            │  redis:6379                  │
            │  qdrant:6333                 │
            └──────────────────────────────┘
```

Workers communicate with the API **only through the queue** (Redis/BullMQ). They never call the API over HTTP. The API is the only process that faces the internet.

## Environment Variables Reference

| Variable | Required by | Default |
|---|---|---|
| `DATABASE_URL` | all services | — |
| `REDIS_URL` | all services | — |
| `NODE_ENV` | all services | `production` |
| `WORKER_CONCURRENCY` | runtime, embedding, memory, scheduler | `4` (scheduler: `2`) |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | all services | — |
| `OTEL_SERVICE_NAME` | all services | set per service |
| `QDRANT_URL` | memory-worker | — |
| `DISCORD_TOKEN` | channel-discord-worker | — |
| `TELEGRAM_BOT_TOKEN` | channel-telegram-worker | — |
| `WHATSAPP_TOKEN` | channel-whatsapp-worker | — |
| `DB_POOL_MAX` | api | `20` |

## OctoEvent Envelope (CRIT-3)

Every BullMQ job payload must use `OctoJobPayload<T>` from `@octo/contracts`:

```typescript
import { createEvent, injectOtelContext, OctoJobPayload } from '@octo/contracts';

// Producer (API / control plane)
const jobData: OctoJobPayload<ExecutionStartedPayload> = {
  event: createEvent('ExecutionStarted', payload, {
    traceId: currentTraceId,
    executionId: run.id,
    agentId: agent.id,
    runId: run.id,
    tenantId: tenant.id,
    source: 'api',
  }),
  _otel: injectOtelContext(),
};
await queue.add('execute', jobData);

// Consumer (runtime-worker)
import { extractOtelContext } from '@octo/contracts';
import { context } from '@opentelemetry/api';

const parentCtx = extractOtelContext(job.data._otel ?? {});
await context.with(parentCtx, () => processJob(job));
```
