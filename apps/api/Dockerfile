# apps/api/Dockerfile
# Multi-stage: base -> pruner -> builder -> runner
# ADR F0-014: turbo prune, non-root, pinned versions, HEALTHCHECK
# Target final image: <200MB

# ─────────────────────────────────────────────
# Stage 0: base — Node.js Alpine + pnpm + turbo
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — sub-repo mínimo para @octo/api
# turbo prune genera out/json (package.jsons) y out/full (source)
# ─────────────────────────────────────────────
FROM base AS pruner
RUN pnpm add -g turbo@2.3.0
COPY . .
RUN turbo prune @octo/api --docker

# ─────────────────────────────────────────────
# Stage 2: builder — instala deps del sub-repo y compila
# ─────────────────────────────────────────────
FROM base AS builder
# Instalar solo las package.jsons primero (cache layer)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
# Copiar source completo del sub-repo pruned
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@octo/api

# ─────────────────────────────────────────────
# Stage 3: runner — imagen final mínima
# Sin build tools, sin source, sin .git
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS runner
RUN apk add --no-cache libc6-compat curl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Non-root user (security — uid=1001)
RUN addgroup --system --gid 1001 octo \
    && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

# Solo dist compilado + node_modules prod + package.json
COPY --from=builder --chown=octo:octo /app/apps/api/dist ./dist
COPY --from=builder --chown=octo:octo /app/node_modules ./node_modules
COPY --from=builder --chown=octo:octo /app/apps/api/package.json ./

USER octo

EXPOSE 3001

# Health check nativo Docker — liveness probe
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/health || exit 1

# Build args para trazabilidad — visibles en /version endpoint
ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    NODE_ENV=production

CMD ["node", "dist/main.js"]
