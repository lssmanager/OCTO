# Root Dockerfile — Coolify deployment proxy for @octo/api
# ─────────────────────────────────────────────────────────────────
# Coolify clones the repo and executes:
#   docker build -f /artifacts/<hash>/Dockerfile /artifacts/<hash>
#
# The build context IS the repo root, which is correct:
# turbo prune requires pnpm-lock.yaml and all workspace package.json
# files to be present — they live at the repo root, not in apps/api/.
#
# SOURCE OF TRUTH: docker/api.Dockerfile (canonical for docker-compose API builds)
# Worker Dockerfiles live in docker/<service-name>/Dockerfile.
#
# SECURITY: Runtime secrets (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.)
# must NEVER appear as ARG or ENV in any Dockerfile. Secrets declared
# as ARG are stored in image layer history and can be extracted with
# `docker history --no-trunc` (MITRE ATT&CK T1552.007).
#
# In Coolify: Application → Environment Variables → Runtime tab.
# Do NOT place secrets in the Build Variables tab — those become ARGs.
# ─────────────────────────────────────────────────────────────────

# syntax=docker/dockerfile:1.4
# cache-bust: guard-relocated-to-apps-api-v1

# ─────────────────────────────────────────────
# Stage 0: base — Node.js Alpine + pnpm
# ─────────────────────────────────────────────
FROM node:22.22.2-alpine3.22 AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@11.2.2
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — generates minimal sub-repo for @octo/api
# ─────────────────────────────────────────────
FROM base AS pruner
ENV TURBO_TELEMETRY_DISABLED=1
ENV NODE_ENV=development
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm dlx turbo@2.9.14 prune @octo/api --docker

# ─────────────────────────────────────────────
# Stage 2: builder — installs pruned sub-repo deps and compiles
# ─────────────────────────────────────────────
FROM base AS builder

ENV NODE_ENV=development
ENV TURBO_TELEMETRY_DISABLED=1

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/.npmrc ./.npmrc
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ARG SOURCE_COMMIT=local
ARG BUILD_VERSION=0.1.0-f1
ARG BUILD_COMMIT=${SOURCE_COMMIT}
ARG BUILD_PHASE=F1
ARG BUILD_TIME=local

# The guard now lives in apps/api/src/admin/internal-secret.guard.ts —
# compiled directly into apps/api dist/. No pnpm store indirection.
# @octo/security is now an empty shell — no need to build it separately.
RUN pnpm turbo build --filter=@octo/api --force

RUN pnpm --filter @octo/api deploy --prod --legacy /app/deploy

RUN mkdir -p /app/deploy/packages/database \
 && cp -r /app/packages/database/dist /app/deploy/packages/database/dist \
 && cp -r /app/packages/database/migrations /app/deploy/packages/database/migrations

# ─────────────────────────────────────────────
# Stage 3: runner — minimal final image
# ─────────────────────────────────────────────
FROM node:22.22.2-alpine3.22 AS runner
RUN apk add --no-cache libc6-compat curl
# The runtime image does not need npm; removing it drops the bundled scan findings.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/npm-cli.js \
    /usr/local/bin/npx-cli.js \
    /usr/local/bin/npm-prefix.js

RUN addgroup --system --gid 1001 octo \
 && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

COPY --from=builder --chown=octo:octo /app/deploy/dist ./dist
COPY --from=builder --chown=octo:octo /app/deploy/node_modules ./node_modules
COPY --from=builder --chown=octo:octo /app/deploy/package.json ./

COPY --from=builder --chown=octo:octo /app/deploy/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=octo:octo /app/deploy/packages/database/migrations ./packages/database/migrations

USER octo

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/health/live || exit 1

ARG SOURCE_COMMIT=local
ARG BUILD_VERSION=0.1.0-f1
ARG BUILD_COMMIT=${SOURCE_COMMIT}
ARG BUILD_PHASE=F1
ARG BUILD_TIME=local

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME} \
    NODE_ENV=production

CMD ["sh", "-c", "node packages/database/dist/migrate.js && node dist/main.js"]
