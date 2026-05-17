# apps/api/Dockerfile
# Multi-stage: base -> pruner -> builder -> runner
# ADR F0-014: turbo prune, non-root, pinned versions, HEALTHCHECK
# Target final image: <200MB
#
# COOLIFY NOTES:
#   - Marcar TODOS los secrets (DATABASE_URL, JWT_SECRET, REDIS_URL,
#     LITELLM_MASTER_KEY, RUNTIME_API_SECRET) como "Runtime only".
#   - NODE_ENV NO debe estar disponible en build-time.
#   - Solo BUILD_VERSION, BUILD_COMMIT, BUILD_PHASE pueden ser build-time ARGs.

# ─────────────────────────────────────────────
# Stage 0: base — Node.js Alpine + pnpm
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — sub-repo mínimo para @octo/api
# Usa pnpm dlx turbo (sin instalación global) para evitar
# problemas de permisos con pnpm add -g en Alpine.
# ─────────────────────────────────────────────
FROM base AS pruner
COPY . .
RUN pnpm dlx turbo@2.3.0 prune @octo/api --docker

# ─────────────────────────────────────────────
# Stage 2: builder — instala deps del sub-repo y compila
# NODE_ENV=development es OBLIGATORIO aquí para que pnpm
# instale devDependencies (TypeScript, NestJS CLI, ts-jest, etc.).
# El runner sobreescribe a production.
# ─────────────────────────────────────────────
FROM base AS builder

# Forzar development explícitamente para blindarse de cualquier
# ARG/ENV inyectado por Coolify u otro orchestrator.
ENV NODE_ENV=development

# Instalar solo los package.jsons primero (cache layer óptimo)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile

# Copiar source completo del sub-repo pruned
COPY --from=pruner /app/out/full/ .

# Build-time args para trazabilidad (sin secrets)
ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

RUN pnpm turbo build --filter=@octo/api

# ─────────────────────────────────────────────
# Stage 3: runner — imagen final mínima
# Sin build tools, sin source, sin .git
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS runner
RUN apk add --no-cache libc6-compat curl

# Non-root user (security — uid=1001)
RUN addgroup --system --gid 1001 octo \
    && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

# dist compilado del app
COPY --from=builder --chown=octo:octo /app/apps/api/dist ./dist
COPY --from=builder --chown=octo:octo /app/apps/api/package.json ./

# node_modules raíz (hoisted deps de pnpm workspace)
COPY --from=builder --chown=octo:octo /app/node_modules ./node_modules

# Paquetes internos del workspace compilados — necesarios para
# resolver @octo/database, @octo/contracts, etc. en runtime.
# turbo prune garantiza que solo los packages transitivos de
# @octo/api estén presentes en /app/packages.
COPY --from=builder --chown=octo:octo /app/packages ./packages

USER octo

EXPOSE 3001

# Health check nativo Docker — liveness probe
# Path incluye el global prefix 'api' (app.setGlobalPrefix('api') en main.ts)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/health/live || exit 1

# Build args para trazabilidad — visibles en /api/health/version
ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

# NODE_ENV=production solo en el runner final, nunca en builder
ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME} \
    NODE_ENV=production

CMD ["node", "dist/main.js"]
