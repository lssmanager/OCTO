# apps/web/Dockerfile
# Multi-stage: base -> pruner -> builder -> runner
# Next.js standalone output — imagen final sin node_modules completo
# ADR F0-014: turbo prune, non-root, pinned versions

# ─────────────────────────────────────────────
# Stage 0: base
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — sub-repo mínimo para @octo/web
# ─────────────────────────────────────────────
FROM base AS pruner
RUN pnpm add -g turbo@2.3.0
COPY . .
RUN turbo prune @octo/web --docker

# ─────────────────────────────────────────────
# Stage 2: builder
# ─────────────────────────────────────────────
FROM base AS builder
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Next.js standalone output requiere NEXT_TELEMETRY_DISABLED en build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@octo/web

# ─────────────────────────────────────────────
# Stage 3: runner — Next.js standalone
# ─────────────────────────────────────────────
FROM node:22.12.0-alpine3.21 AS runner
RUN apk add --no-cache libc6-compat curl

# Non-root user
RUN addgroup --system --gid 1001 octo \
    && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000

# Next.js standalone bundle
COPY --from=builder --chown=octo:octo /app/apps/web/.next/standalone ./
COPY --from=builder --chown=octo:octo /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=octo:octo /app/apps/web/public ./apps/web/public

USER octo

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE}

CMD ["node", "apps/web/server.js"]
