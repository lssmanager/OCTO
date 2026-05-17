# apps/api/Dockerfile — SOURCE OF TRUTH
# ─────────────────────────────────────────────────────────────────
# Build context must be the monorepo ROOT (not apps/api/).
# Coolify sets context = repo root automatically when Dockerfile
# is at the repo root — see root Dockerfile (proxy copy).
# ─────────────────────────────────────────────────────────────────

# ─────────────────────────────────────────────
# Stage 0: base — Node.js Alpine + pnpm
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — genera sub-repo mínimo para @octo/api
#
# REQUISITO: pnpm-lock.yaml DEBE estar commiteado en el repo.
# --frozen-lockfile garantiza builds reproducibles y evita
# dependency drift entre builds de Coolify/CI.
#
# Si este step falla con ERR_PNPM_NO_LOCKFILE, genera el lockfile
# localmente y commitéalo:
#   $env:HUSKY="0"; pnpm install   # PowerShell
#   HUSKY=0 pnpm install           # bash/zsh
#   git add pnpm-lock.yaml && git commit -m "chore: add pnpm lockfile"
#
# HUSKY=0 — deshabilita husky en Docker (no hay .git)
# TURBO_TELEMETRY_DISABLED=1 — evita prompt interactivo en CI
# VERSIÓN DE TURBO: debe coincidir con la devDependency en
# package.json raíz para evitar errores de parseo del turbo.json.
# ─────────────────────────────────────────────
FROM base AS pruner
ENV TURBO_TELEMETRY_DISABLED=1
COPY . .
RUN HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm dlx turbo@2.9.14 prune @octo/api --docker

# ─────────────────────────────────────────────
# Stage 2: builder — instala deps del sub-repo y compila
# NODE_ENV=development es OBLIGATORIO para instalar devDependencies.
# ─────────────────────────────────────────────
FROM base AS builder

ENV NODE_ENV=development
ENV TURBO_TELEMETRY_DISABLED=1

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN HUSKY=0 pnpm install --frozen-lockfile

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

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retires=3 \
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
