# apps/memory-worker/Dockerfile
# Port: 3005 | Service: @octo/memory-worker
#
# BUILD CONTEXT: Must be repo root (/) for turbo prune.
#
# SECURITY: Runtime secrets (DATABASE_URL, REDIS_URL, QDRANT_URL)
# must NEVER appear as ARG or ENV here. Inject via Coolify →
# Environment Variables → Runtime tab (NOT Build-time).

# syntax=docker/dockerfile:1.4

FROM node:22.22.2-alpine3.22 AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@11.2.2
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

FROM base AS pruner
ENV TURBO_TELEMETRY_DISABLED=1
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm dlx turbo@2.9.14 prune @octo/memory-worker --docker

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

RUN pnpm turbo build --filter=@octo/memory-worker

FROM node:22.22.2-alpine3.22 AS runner
# The runtime image does not need npm; removing it drops bundled npm dependency scan findings.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/npm-cli.js \
    /usr/local/bin/npx-cli.js \
    /usr/local/bin/npm-prefix.js
RUN apk add --no-cache libc6-compat curl

RUN addgroup --system --gid 1001 octo \
 && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

COPY --from=builder --chown=octo:octo /app/apps/memory-worker/dist ./dist
COPY --from=builder --chown=octo:octo /app/apps/memory-worker/package.json ./
COPY --from=builder --chown=octo:octo /app/node_modules ./node_modules
COPY --from=builder --chown=octo:octo /app/packages ./packages

USER octo

EXPOSE 3005

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3005/health/live || exit 1

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME} \
    NODE_ENV=production \
    WORKER_CONCURRENCY=${WORKER_CONCURRENCY:-4}

CMD ["node", "dist/main.js"]
