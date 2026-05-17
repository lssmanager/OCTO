# Root Dockerfile — Coolify deployment proxy
# ─────────────────────────────────────────────────────────────────
# Coolify clones the repo and executes:
#   docker build -f /artifacts/<hash>/Dockerfile /artifacts/<hash>
#
# The build context IS the repo root, which is correct:
# turbo prune requires pnpm-lock.yaml and all workspace package.json
# files to be present — they live at the repo root, not in apps/api/.
#
# This file is a verbatim copy of apps/api/Dockerfile.
# SOURCE OF TRUTH: apps/api/Dockerfile
# Keep in sync manually or via CI lint rule.
# ─────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────
# Stage 0: base — Node.js Alpine + pnpm
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — sub-repo mínimo para @octo/api
# ─────────────────────────────────────────────
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.3.0 prune @octo/api --docker

# ─────────────────────────────────────────────
# Stage 2: builder — instala deps del sub-repo y compila
# NODE_ENV=development es OBLIGATORIO para instalar devDependencies.
# ─────────────────────────────────────────────
FROM base AS builder

ENV NODE_ENV=development

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

RUN pnpm turbo build --filter=@octo/api

# ─────────────────────────────────────────────
# Stage 3: runner — imagen final mínima
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
