# apps/web/Dockerfile
# Multi-stage: pruner → builder → runner (Next.js standalone)
#
# Requiere: apps/web/next.config.ts con output: 'standalone'
# Sin standalone, Next.js genera node_modules de 300MB+ en imagen.
# Con standalone, la imagen final es ~120MB.
#
# Build:
#   docker build -f apps/web/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=http://localhost:3001 \
#     -t octo-web .

FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ── Stage 1: Turbo prune ─────────────────────────────────────────────────────
FROM base AS pruner
RUN pnpm add -g turbo@2.3.0
COPY . .
RUN turbo prune @octo/web --docker

# ── Stage 2: Install + Build ─────────────────────────────────────────────────
FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .

# NEXT_PUBLIC_* vars deben estar presentes en build time (Next.js los inlines)
ARG NEXT_PUBLIC_API_URL=http://localhost:3001
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

RUN pnpm turbo build --filter=@octo/web

# ── Stage 3: Runner (Next.js standalone) ────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS runner
RUN apk add --no-cache curl

RUN addgroup --system --gid 1001 octo \
  && adduser --system --uid 1001 --ingroup octo --no-create-home octo

WORKDIR /app

# standalone output contiene su propio server.js y node_modules mínimos
COPY --from=builder --chown=octo:octo /app/apps/web/.next/standalone ./
COPY --from=builder --chown=octo:octo /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=octo:octo /app/apps/web/public ./apps/web/public

USER octo

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=20s --retries=3 \
  CMD curl -f http://localhost:3000 || exit 1

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    NODE_ENV=production \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Next.js standalone usa apps/web/server.js como entrypoint
CMD ["node", "apps/web/server.js"]
