# apps/channel-telegram-worker/Dockerfile
# Port: 3007 | Service: @octo/channel-telegram-worker
#
# Channel workers are transport-only: receive message → normalize to
# NormalizedIncomingMessage → publish to queue → done.
# Routing logic belongs in runtime-worker, never here.
#
# BUILD CONTEXT: Must be repo root (/) for turbo prune.
#
# SECURITY: Runtime secrets (TELEGRAM_BOT_TOKEN, DATABASE_URL, REDIS_URL)
# must NEVER appear as ARG or ENV here. Inject via Coolify →
# Environment Variables → Runtime tab (NOT Build-time).

# syntax=docker/dockerfile:1.4

FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

FROM base AS pruner
ENV TURBO_TELEMETRY_DISABLED=1
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm dlx turbo@2.9.14 prune @octo/channel-telegram-worker --docker

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

RUN pnpm turbo build --filter=@octo/channel-telegram-worker

FROM node:22.12.0-alpine3.21 AS runner
RUN apk add --no-cache libc6-compat curl

RUN addgroup --system --gid 1001 octo \
 && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

COPY --from=builder --chown=octo:octo /app/apps/channel-telegram-worker/dist ./dist
COPY --from=builder --chown=octo:octo /app/apps/channel-telegram-worker/package.json ./
COPY --from=builder --chown=octo:octo /app/node_modules ./node_modules
COPY --from=builder --chown=octo:octo /app/packages ./packages

USER octo

EXPOSE 3007

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3007/health/live || exit 1

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME} \
    NODE_ENV=production

CMD ["node", "dist/main.js"]
