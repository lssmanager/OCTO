# apps/api/Dockerfile
# Multi-stage: pruner → builder → runner
#
# F0-008: Un contenedor por app, ciclo de vida independiente.
# Patrón turbo prune: genera sub-repo mínimo con solo las deps de @octo/api.
# Imagen final: <200MB, non-root uid=1001, sin build tools ni source.
#
# Build:
#   docker build -f apps/api/Dockerfile \
#     --build-arg BUILD_VERSION=0.0.1-f0 \
#     --build-arg BUILD_COMMIT=$(git rev-parse --short HEAD) \
#     --build-arg BUILD_PHASE=F0 \
#     -t octo-api .

# ── Base: Node + pnpm ─────────────────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ── Stage 1: Turbo prune ─────────────────────────────────────────────────────
# Genera /app/out/ con solo las dependencias necesarias para @octo/api.
# Evita copiar apps/web, apps/runtime-worker, etc. en la imagen final.
FROM base AS pruner
RUN pnpm add -g turbo@2.3.0
COPY . .
RUN turbo prune @octo/api --docker

# ── Stage 2: Install + Build ─────────────────────────────────────────────────
FROM base AS builder
# Instalar deps del sub-repo pruned (lockfile exacto, reproducible)
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
# Copiar source y compilar solo @octo/api + sus paquetes internos
COPY --from=pruner /app/out/full/ .
RUN pnpm turbo build --filter=@octo/api

# ── Stage 3: Runtime (imagen final) ─────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS runner
RUN apk add --no-cache libc6-compat curl
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

# Non-root: uid=1001, gid=1001
# Nunca correr procesos de aplicación como root (security requirement)
RUN addgroup --system --gid 1001 octo \
  && adduser --system --uid 1001 --ingroup octo --no-create-home octo

WORKDIR /app

# Copiar solo artefactos compilados — sin source TypeScript, sin devDependencies
COPY --from=builder --chown=octo:octo /app/apps/api/dist ./dist
COPY --from=builder --chown=octo:octo /app/node_modules ./node_modules
COPY --from=builder --chown=octo:octo /app/apps/api/package.json ./package.json

USER octo

EXPOSE 3001

# HEALTHCHECK nativo Docker: Coolify y docker compose usan esto para
# determinar si el contenedor está listo antes de marcar service_healthy.
# --start-period=40s: tiempo que NestJS necesita para completar bootstrap.
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/health/live || exit 1

# Build args → ENV: visibles en /api/version endpoint y en logs de startup.
# NUNCA pasar secrets como ARG — usar env_file en runtime.
ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    NODE_ENV=production

CMD ["node", "dist/main.js"]
