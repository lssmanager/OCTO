# F1 Docker Reproducibility & Hardening Report

- Date (UTC): 2026-06-06T21:44:28Z
- Commit: bfb14c329571af22802e35dd870849b9a299c4de
- Branch: work
- Result: PASS
- Summary: PASS=124, WARN=42, FAIL=0

## Images

| Source | Image | Version/tag | Digest |
|---|---|---|---|
| docker/compose.dev.yml:postgres | `postgres:16.6-alpine3.21` | `16.6-alpine3.21` | `n/a` |
| docker/compose.dev.yml:redis-queue | `redis:7.4.2-alpine3.21` | `7.4.2-alpine3.21` | `n/a` |
| docker/compose.dev.yml:redis-cache | `redis:7.4.2-alpine3.21` | `7.4.2-alpine3.21` | `n/a` |
| docker-compose.f1.yml:postgres | `postgres:16.6-alpine3.21` | `16.6-alpine3.21` | `n/a` |
| docker-compose.f1.yml:redis | `redis:7.4.2-alpine3.21` | `7.4.2-alpine3.21` | `n/a` |
| docker-compose.f1.yml:migrate | `octo/migrate:sha-${GIT_SHA:-local}` | `-local}` | `n/a` |
| docker-compose.f1.yml:api | `octo/api:sha-${GIT_SHA:-local}` | `-local}` | `n/a` |
| docker-compose.f1.yml:runtime-worker | `octo/runtime-worker:sha-${GIT_SHA:-local}` | `-local}` | `n/a` |
| docker-compose.f1.yml:outbox-publisher-worker | `octo/outbox-publisher-worker:sha-${GIT_SHA:-local}` | `-local}` | `n/a` |
| docker-compose.f1.yml:scheduler-worker | `octo/scheduler-worker:sha-${GIT_SHA:-local}` | `-local}` | `n/a` |
| docker-compose.f1.yml:reclaimer-worker | `octo/reclaimer-worker:sha-${GIT_SHA:-local}` | `-local}` | `n/a` |
| docker-compose.yml:postgres | `postgres:16.6-alpine3.21` | `16.6-alpine3.21` | `n/a` |
| docker-compose.yml:redis | `redis:7.4.2-alpine3.21` | `7.4.2-alpine3.21` | `n/a` |
| docker-compose.yml:litellm | `ghcr.io/berriai/litellm:main-v1.61.7@sha256:0f7f39f40bf6ba4cc802b991ce8c4eb2fa41c8a25b821e1d2d5197229cad27fe` | `digest-pinned` | `sha256:0f7f39f40bf6ba4cc802b991ce8c4eb2fa41c8a25b821e1d2d5197229cad27fe` |
| infra/compose/docker-compose.infra.yml:postgres | `postgres:16.6-alpine3.21` | `16.6-alpine3.21` | `n/a` |
| infra/compose/docker-compose.infra.yml:redis | `redis:7.4.2-alpine3.21` | `7.4.2-alpine3.21` | `n/a` |
| infra/compose/docker-compose.infra.yml:qdrant | `qdrant/qdrant:v1.12.5` | `v1.12.5` | `n/a` |
| infra/compose/docker-compose.infra.yml:minio | `minio/minio:RELEASE.2024-12-18T13-15-44Z` | `RELEASE.2024-12-18T13-15-44Z` | `n/a` |
| infra/compose/docker-compose.observability.yml:otel-collector | `otel/opentelemetry-collector-contrib:0.116.1` | `0.116.1` | `n/a` |
| infra/compose/docker-compose.observability.yml:prometheus | `prom/prometheus:v2.55.1` | `v2.55.1` | `n/a` |
| infra/compose/docker-compose.observability.yml:grafana | `grafana/grafana:11.4.0` | `11.4.0` | `n/a` |
| infra/compose/docker-compose.observability.yml:loki | `grafana/loki:3.3.2` | `3.3.2` | `n/a` |
| infra/docker-compose.observability.yml:otel-collector | `otel/opentelemetry-collector-contrib:0.115.0` | `0.115.0` | `n/a` |
| infra/docker-compose.observability.yml:prometheus | `prom/prometheus:v2.55.0` | `v2.55.0` | `n/a` |
| infra/docker-compose.observability.yml:grafana | `grafana/grafana:11.3.0` | `11.3.0` | `n/a` |
| infra/docker-compose.observability.yml:loki | `grafana/loki:3.2.0` | `3.2.0` | `n/a` |
| Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| apps/channel-discord-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/channel-discord-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/channel-telegram-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/channel-telegram-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/channel-whatsapp-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/channel-whatsapp-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/embedding-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/embedding-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/memory-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/memory-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/reclaimer-worker/Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| apps/reclaimer-worker/Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| apps/runtime-worker/Dockerfile:FROM | `python:3.12.8-slim-bookworm` | `3.12.8-slim-bookworm` | `n/a` |
| apps/scheduler-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/scheduler-worker/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/web/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| apps/web/Dockerfile:FROM | `node:22.12.0-alpine3.21` | `22.12.0-alpine3.21` | `n/a` |
| docker/api.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/api.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/channel-discord-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/channel-discord-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/channel-telegram-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/channel-telegram-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/channel-whatsapp-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/channel-whatsapp-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/embedding-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/embedding-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/memory-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/memory-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/migrate.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/migrate.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/outbox-publisher-worker.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/outbox-publisher-worker.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/reclaimer-worker.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/reclaimer-worker.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/runtime-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/runtime-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/runtime-worker.Dockerfile:FROM | `python:3.12.8-slim-bookworm` | `3.12.8-slim-bookworm` | `n/a` |
| docker/runtime-worker.Dockerfile:FROM | `python:3.12.8-slim-bookworm` | `3.12.8-slim-bookworm` | `n/a` |
| docker/scheduler-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/scheduler-worker/Dockerfile:FROM | `node:22.16.0-alpine3.21` | `22.16.0-alpine3.21` | `n/a` |
| docker/scheduler-worker.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |
| docker/scheduler-worker.Dockerfile:FROM | `node:22.22.2-alpine3.22` | `22.22.2-alpine3.22` | `n/a` |

## Exposed ports, health checks and restart policies

| Compose | Service | Ports | Healthcheck | Restart |
|---|---|---|---|---|
| docker/compose.dev.yml | postgres | `["5432:5432"]` | yes | `unless-stopped` |
| docker/compose.dev.yml | redis-queue | `["6380:6379"]` | yes | `unless-stopped` |
| docker/compose.dev.yml | redis-cache | `["6381:6379"]` | yes | `unless-stopped` |
| docker-compose.f1.yml | api | `["3001:3001"]` | yes | `unless-stopped` |
| docker-compose.f1.yml | runtime-worker | `["8000:8000"]` | yes | `unless-stopped` |
| docker-compose.f1.yml | outbox-publisher-worker | `["3010:3010"]` | yes | `unless-stopped` |
| docker-compose.f1.yml | scheduler-worker | `["3003:3003"]` | yes | `unless-stopped` |
| docker-compose.yml | api | `["${PORT:-3001}:3001"]` | yes | `unless-stopped` |
| docker-compose.yml | web | `["${WEB_PORT:-3000}:3000"]` | yes | `unless-stopped` |
| docker-compose.yml | runtime-worker | `["${WORKER_PORT:-8000}:8000"]` | yes | `unless-stopped` |
| docker-compose.yml | outbox-publisher-worker | `["${OUTBOX_PUBLISHER_PORT:-3010}:3010"]` | yes | `unless-stopped` |
| docker-compose.yml | reclaimer-worker | `["${RECLAIMER_HEALTH_PORT:-3011}:3011"]` | yes | `unless-stopped` |
| docker-compose.yml | litellm | `["${LITELLM_PORT:-4000}:4000"]` | yes | `unless-stopped` |
| infra/compose/docker-compose.infra.yml | postgres | `["127.0.0.1:5432:5432"]` | yes | `unless-stopped` |
| infra/compose/docker-compose.infra.yml | redis | `["127.0.0.1:6379:6379"]` | yes | `unless-stopped` |
| infra/compose/docker-compose.infra.yml | qdrant | `["127.0.0.1:6333:6333", "127.0.0.1:6334:6334"]` | yes | `unless-stopped` |
| infra/compose/docker-compose.infra.yml | minio | `["127.0.0.1:9000:9000", "127.0.0.1:9001:9001"]` | yes | `unless-stopped` |
| infra/compose/docker-compose.observability.yml | otel-collector | `["4317:4317", "4318:4318", "8888:8888"]` | yes | `unless-stopped` |
| infra/compose/docker-compose.observability.yml | prometheus | `["9090:9090"]` | yes | `unless-stopped` |
| infra/compose/docker-compose.observability.yml | grafana | `["3100:3000"]` | yes | `unless-stopped` |
| infra/compose/docker-compose.observability.yml | loki | `["3200:3100"]` | yes | `unless-stopped` |
| infra/docker-compose.observability.yml | otel-collector | `["4317:4317", "4318:4318", "8889:8889"]` | yes | `unless-stopped` |
| infra/docker-compose.observability.yml | prometheus | `["9090:9090"]` | yes | `unless-stopped` |
| infra/docker-compose.observability.yml | grafana | `["3100:3000"]` | yes | `unless-stopped` |
| infra/docker-compose.observability.yml | loki | `["3200:3100"]` | yes | `unless-stopped` |

## Dockerfiles

| Path | Stages | Final USER | OCI labels |
|---|---:|---|---|
| `Dockerfile` | 4 | `octo` | no |
| `apps/channel-discord-worker/Dockerfile` | 4 | `octo` | no |
| `apps/channel-telegram-worker/Dockerfile` | 4 | `octo` | no |
| `apps/channel-whatsapp-worker/Dockerfile` | 4 | `octo` | no |
| `apps/embedding-worker/Dockerfile` | 4 | `octo` | no |
| `apps/memory-worker/Dockerfile` | 4 | `octo` | no |
| `apps/reclaimer-worker/Dockerfile` | 2 | `reclaimer` | yes |
| `apps/runtime-worker/Dockerfile` | 3 | `octo` | no |
| `apps/scheduler-worker/Dockerfile` | 4 | `octo` | no |
| `apps/web/Dockerfile` | 4 | `octo` | no |
| `docker/api.Dockerfile` | 2 | `octo` | yes |
| `docker/channel-discord-worker/Dockerfile` | 4 | `octo` | no |
| `docker/channel-telegram-worker/Dockerfile` | 4 | `octo` | no |
| `docker/channel-whatsapp-worker/Dockerfile` | 4 | `octo` | no |
| `docker/embedding-worker/Dockerfile` | 4 | `octo` | no |
| `docker/memory-worker/Dockerfile` | 4 | `octo` | no |
| `docker/migrate.Dockerfile` | 2 | `octo` | yes |
| `docker/outbox-publisher-worker.Dockerfile` | 2 | `octo` | yes |
| `docker/reclaimer-worker.Dockerfile` | 2 | `reclaimer` | yes |
| `docker/runtime-worker/Dockerfile` | 4 | `octo` | no |
| `docker/runtime-worker.Dockerfile` | 2 | `1001:1001` | yes |
| `docker/scheduler-worker/Dockerfile` | 4 | `octo` | no |
| `docker/scheduler-worker.Dockerfile` | 2 | `octo` | yes |

## Check log

| Level | Check | Detail |
|---|---|---|
| WARN | compose services | docker/compose.base.yml: no services found |
| PASS | restart policy | docker/compose.dev.yml:postgres: unless-stopped |
| PASS | healthcheck | docker/compose.dev.yml:postgres: healthcheck configured |
| PASS | restart policy | docker/compose.dev.yml:redis-queue: unless-stopped |
| PASS | healthcheck | docker/compose.dev.yml:redis-queue: healthcheck configured |
| WARN | compose hardening | docker/compose.dev.yml:redis-queue: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | docker/compose.dev.yml:redis-cache: unless-stopped |
| PASS | healthcheck | docker/compose.dev.yml:redis-cache: healthcheck configured |
| WARN | compose hardening | docker/compose.dev.yml:redis-cache: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | docker-compose.f1.yml:postgres: unless-stopped |
| PASS | healthcheck | docker-compose.f1.yml:postgres: healthcheck configured |
| PASS | restart policy | docker-compose.f1.yml:redis: unless-stopped |
| PASS | healthcheck | docker-compose.f1.yml:redis: healthcheck configured |
| PASS | restart policy exception | docker-compose.f1.yml:migrate: one-shot migration job uses restart: no |
| PASS | healthcheck exception | docker-compose.f1.yml:migrate: one-shot job gated by service_completed_successfully |
| PASS | restart policy | docker-compose.f1.yml:api: unless-stopped |
| PASS | healthcheck | docker-compose.f1.yml:api: healthcheck configured |
| PASS | compose hardening | docker-compose.f1.yml:api: read-only, no-new-privileges and cap_drop ALL |
| PASS | restart policy | docker-compose.f1.yml:runtime-worker: unless-stopped |
| PASS | healthcheck | docker-compose.f1.yml:runtime-worker: healthcheck configured |
| PASS | compose hardening | docker-compose.f1.yml:runtime-worker: read-only, no-new-privileges and cap_drop ALL |
| PASS | restart policy | docker-compose.f1.yml:outbox-publisher-worker: unless-stopped |
| PASS | healthcheck | docker-compose.f1.yml:outbox-publisher-worker: healthcheck configured |
| PASS | compose hardening | docker-compose.f1.yml:outbox-publisher-worker: read-only, no-new-privileges and cap_drop ALL |
| PASS | restart policy | docker-compose.f1.yml:scheduler-worker: unless-stopped |
| PASS | healthcheck | docker-compose.f1.yml:scheduler-worker: healthcheck configured |
| PASS | compose hardening | docker-compose.f1.yml:scheduler-worker: read-only, no-new-privileges and cap_drop ALL |
| PASS | restart policy | docker-compose.f1.yml:reclaimer-worker: unless-stopped |
| PASS | healthcheck | docker-compose.f1.yml:reclaimer-worker: healthcheck configured |
| PASS | compose hardening | docker-compose.f1.yml:reclaimer-worker: read-only, no-new-privileges and cap_drop ALL |
| PASS | restart policy | docker-compose.yml:postgres: unless-stopped |
| PASS | healthcheck | docker-compose.yml:postgres: healthcheck configured |
| PASS | restart policy | docker-compose.yml:redis: unless-stopped |
| PASS | healthcheck | docker-compose.yml:redis: healthcheck configured |
| PASS | restart policy exception | docker-compose.yml:migrate: one-shot migration job uses restart: no |
| PASS | healthcheck exception | docker-compose.yml:migrate: one-shot job gated by service_completed_successfully |
| PASS | restart policy | docker-compose.yml:api: unless-stopped |
| PASS | healthcheck | docker-compose.yml:api: healthcheck configured |
| WARN | compose hardening | docker-compose.yml:api: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | docker-compose.yml:web: unless-stopped |
| PASS | healthcheck | docker-compose.yml:web: healthcheck configured |
| WARN | compose hardening | docker-compose.yml:web: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | docker-compose.yml:runtime-worker: unless-stopped |
| PASS | healthcheck | docker-compose.yml:runtime-worker: healthcheck configured |
| WARN | compose hardening | docker-compose.yml:runtime-worker: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | docker-compose.yml:outbox-publisher-worker: unless-stopped |
| PASS | healthcheck | docker-compose.yml:outbox-publisher-worker: healthcheck configured |
| WARN | compose hardening | docker-compose.yml:outbox-publisher-worker: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | docker-compose.yml:scheduler-worker: unless-stopped |
| PASS | healthcheck | docker-compose.yml:scheduler-worker: healthcheck configured |
| WARN | compose hardening | docker-compose.yml:scheduler-worker: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | docker-compose.yml:reclaimer-worker: unless-stopped |
| PASS | healthcheck | docker-compose.yml:reclaimer-worker: healthcheck configured |
| WARN | compose hardening | docker-compose.yml:reclaimer-worker: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | docker-compose.yml:litellm: unless-stopped |
| PASS | healthcheck | docker-compose.yml:litellm: healthcheck configured |
| WARN | compose hardening | docker-compose.yml:litellm: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/compose/docker-compose.infra.yml:postgres: unless-stopped |
| PASS | healthcheck | infra/compose/docker-compose.infra.yml:postgres: healthcheck configured |
| PASS | restart policy | infra/compose/docker-compose.infra.yml:redis: unless-stopped |
| PASS | healthcheck | infra/compose/docker-compose.infra.yml:redis: healthcheck configured |
| PASS | restart policy | infra/compose/docker-compose.infra.yml:qdrant: unless-stopped |
| PASS | healthcheck | infra/compose/docker-compose.infra.yml:qdrant: healthcheck configured |
| WARN | compose hardening | infra/compose/docker-compose.infra.yml:qdrant: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/compose/docker-compose.infra.yml:minio: unless-stopped |
| PASS | healthcheck | infra/compose/docker-compose.infra.yml:minio: healthcheck configured |
| WARN | compose hardening | infra/compose/docker-compose.infra.yml:minio: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/compose/docker-compose.observability.yml:otel-collector: unless-stopped |
| PASS | healthcheck | infra/compose/docker-compose.observability.yml:otel-collector: healthcheck configured |
| WARN | compose hardening | infra/compose/docker-compose.observability.yml:otel-collector: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/compose/docker-compose.observability.yml:prometheus: unless-stopped |
| PASS | healthcheck | infra/compose/docker-compose.observability.yml:prometheus: healthcheck configured |
| WARN | compose hardening | infra/compose/docker-compose.observability.yml:prometheus: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/compose/docker-compose.observability.yml:grafana: unless-stopped |
| PASS | healthcheck | infra/compose/docker-compose.observability.yml:grafana: healthcheck configured |
| WARN | compose hardening | infra/compose/docker-compose.observability.yml:grafana: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/compose/docker-compose.observability.yml:loki: unless-stopped |
| PASS | healthcheck | infra/compose/docker-compose.observability.yml:loki: healthcheck configured |
| WARN | compose hardening | infra/compose/docker-compose.observability.yml:loki: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/docker-compose.observability.yml:otel-collector: unless-stopped |
| PASS | healthcheck | infra/docker-compose.observability.yml:otel-collector: healthcheck configured |
| WARN | compose hardening | infra/docker-compose.observability.yml:otel-collector: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/docker-compose.observability.yml:prometheus: unless-stopped |
| PASS | healthcheck | infra/docker-compose.observability.yml:prometheus: healthcheck configured |
| WARN | compose hardening | infra/docker-compose.observability.yml:prometheus: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/docker-compose.observability.yml:grafana: unless-stopped |
| PASS | healthcheck | infra/docker-compose.observability.yml:grafana: healthcheck configured |
| WARN | compose hardening | infra/docker-compose.observability.yml:grafana: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | restart policy | infra/docker-compose.observability.yml:loki: unless-stopped |
| PASS | healthcheck | infra/docker-compose.observability.yml:loki: healthcheck configured |
| WARN | compose hardening | infra/docker-compose.observability.yml:loki: missing read_only: true, security_opt: no-new-privileges:true, cap_drop: ALL |
| PASS | Dockerfile multi-stage | Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | Dockerfile: octo |
| WARN | OCI labels | Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | apps/channel-discord-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | apps/channel-discord-worker/Dockerfile: octo |
| WARN | OCI labels | apps/channel-discord-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | apps/channel-telegram-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | apps/channel-telegram-worker/Dockerfile: octo |
| WARN | OCI labels | apps/channel-telegram-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | apps/channel-whatsapp-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | apps/channel-whatsapp-worker/Dockerfile: octo |
| WARN | OCI labels | apps/channel-whatsapp-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | apps/embedding-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | apps/embedding-worker/Dockerfile: octo |
| WARN | OCI labels | apps/embedding-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | apps/memory-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | apps/memory-worker/Dockerfile: octo |
| WARN | OCI labels | apps/memory-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | apps/reclaimer-worker/Dockerfile: 2 stages |
| PASS | Dockerfile runtime user | apps/reclaimer-worker/Dockerfile: reclaimer |
| PASS | OCI labels | apps/reclaimer-worker/Dockerfile: required label set present |
| PASS | Dockerfile multi-stage | apps/runtime-worker/Dockerfile: 3 stages |
| PASS | Dockerfile runtime user | apps/runtime-worker/Dockerfile: octo |
| WARN | OCI labels | apps/runtime-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | apps/scheduler-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | apps/scheduler-worker/Dockerfile: octo |
| WARN | OCI labels | apps/scheduler-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | apps/web/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | apps/web/Dockerfile: octo |
| WARN | OCI labels | apps/web/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | docker/api.Dockerfile: 2 stages |
| PASS | Dockerfile runtime user | docker/api.Dockerfile: octo |
| PASS | OCI labels | docker/api.Dockerfile: required label set present |
| PASS | Dockerfile multi-stage | docker/channel-discord-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | docker/channel-discord-worker/Dockerfile: octo |
| WARN | OCI labels | docker/channel-discord-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | docker/channel-telegram-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | docker/channel-telegram-worker/Dockerfile: octo |
| WARN | OCI labels | docker/channel-telegram-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | docker/channel-whatsapp-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | docker/channel-whatsapp-worker/Dockerfile: octo |
| WARN | OCI labels | docker/channel-whatsapp-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | docker/embedding-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | docker/embedding-worker/Dockerfile: octo |
| WARN | OCI labels | docker/embedding-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | docker/memory-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | docker/memory-worker/Dockerfile: octo |
| WARN | OCI labels | docker/memory-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | docker/migrate.Dockerfile: 2 stages |
| PASS | Dockerfile runtime user | docker/migrate.Dockerfile: octo |
| PASS | OCI labels | docker/migrate.Dockerfile: required label set present |
| PASS | Dockerfile multi-stage | docker/outbox-publisher-worker.Dockerfile: 2 stages |
| PASS | Dockerfile runtime user | docker/outbox-publisher-worker.Dockerfile: octo |
| PASS | OCI labels | docker/outbox-publisher-worker.Dockerfile: required label set present |
| PASS | Dockerfile multi-stage | docker/reclaimer-worker.Dockerfile: 2 stages |
| PASS | Dockerfile runtime user | docker/reclaimer-worker.Dockerfile: reclaimer |
| PASS | OCI labels | docker/reclaimer-worker.Dockerfile: required label set present |
| PASS | Dockerfile multi-stage | docker/runtime-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | docker/runtime-worker/Dockerfile: octo |
| WARN | OCI labels | docker/runtime-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | docker/runtime-worker.Dockerfile: 2 stages |
| PASS | Dockerfile runtime user | docker/runtime-worker.Dockerfile: 1001:1001 |
| PASS | OCI labels | docker/runtime-worker.Dockerfile: required label set present |
| PASS | Dockerfile multi-stage | docker/scheduler-worker/Dockerfile: 4 stages |
| PASS | Dockerfile runtime user | docker/scheduler-worker/Dockerfile: octo |
| WARN | OCI labels | docker/scheduler-worker/Dockerfile: missing title/version/source label set |
| PASS | Dockerfile multi-stage | docker/scheduler-worker.Dockerfile: 2 stages |
| PASS | Dockerfile runtime user | docker/scheduler-worker.Dockerfile: octo |
| PASS | OCI labels | docker/scheduler-worker.Dockerfile: required label set present |
| WARN | built image inspect | octo/api:sha-local: not present locally; static Dockerfile checks used |
| WARN | built image inspect | octo/runtime-worker:sha-local: not present locally; static Dockerfile checks used |
| WARN | built image inspect | octo/scheduler-worker:sha-local: not present locally; static Dockerfile checks used |
| WARN | built image inspect | octo/migrate:sha-local: not present locally; static Dockerfile checks used |
| WARN | built image inspect | octo/outbox-publisher-worker:sha-local: not present locally; static Dockerfile checks used |
| WARN | built image inspect | octo/reclaimer-worker:sha-local: not present locally; static Dockerfile checks used |
