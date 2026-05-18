# Root Dockerfile — Coolify deployment proxy for @octo/api
# ─────────────────────────────────────────────────────────────────
# Coolify clones the repo and executes:
#   docker build -f /artifacts/<hash>/Dockerfile /artifacts/<hash>
#
# The build context IS the repo root, which is correct:
# turbo prune requires pnpm-lock.yaml and all workspace package.json
# files to be present — they live at the repo root, not in apps/api/.
#
# SOURCE OF TRUTH: apps/api/Dockerfile (canonical for the API)
# Worker Dockerfiles live in docker/<service-name>/Dockerfile.
#
# SECURITY: Runtime secrets (DATABASE_URL, REDIS_URL, API keys, etc.)
# must NEVER appear as ARG or ENV in any Dockerfile. Secrets declared
# as ARG are stored in image layer history and can be extracted with
# `docker history --no-trunc` (MITRE ATT&CK T1552.007).
# Inject all runtime credentials via Coolify → Application →
# Environment Variables (Runtime tab, NOT Build-time).
# ─────────────────────────────────────────────────────────────────

# syntax=docker/dockerfile:1.4

# ─────────────────────────────────────────────
# Stage 0: base — Node.js Alpine + pnpm
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — generates minimal sub-repo for @octo/api
#
# pnpm-lock.yaml MUST be committed in the repo.
# --frozen-lockfile guarantees reproducible builds.
# HUSKY=0 — disables husky in Docker (no .git)
# TURBO_TELEMETRY_DISABLED=1 — avoids interactive prompt in CI
# ─────────────────────────────────────────────
FROM base AS pruner
ENV TURBO_TELEMETRY_DISABLED=1
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm dlx turbo@2.9.14 prune @octo/api --docker

# ─────────────────────────────────────────────
# Stage 2: builder — installs sub-repo deps and compiles
# NODE_ENV=development is REQUIRED to install devDependencies.
# ─────────────────────────────────────────────
FROM base AS builder

ENV NODE_ENV=development
ENV TURBO_TELEMETRY_DISABLED=1

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

RUN pnpm turbo build --filter=@octo/api

# ─────────────────────────────────────────────
# Stage 3: runner — minimal final image
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS runner
RUN apk add --no-cache libc6-compat curl

RUN addgroup --system --gid 1001 octo \
 && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

COPY --from=builder --chown=octo:octo /app/apps/api/dist ./dist
COPY --from=builder --chown=octo:octo /app/apps/api/package.json ./
COPY --from=builder --chown=octo:octo /app/node_modules ./node_modules
COPY --from=builder --chown=octo:octo /app/packages ./packages

USER octo

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/health/live || exit 1

# Build-time metadata only — safe as ARG/ENV.
# Runtime secrets must NEVER appear here. See security note at top.
ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME} \
    NODE_ENV=production \
    DB_POOL_MAX=${DB_POOL_MAX:-20}

# migrate.js runs first: applies pending migrations then starts the API.
# If migrate.js exits non-zero, main.js is never started.
CMD ["sh", "-c", "node dist/migrate.js && node dist/main.js"]
