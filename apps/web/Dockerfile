# apps/web/Dockerfile
# Multi-stage: base -> pruner -> builder -> runner
# Next.js standalone output — imagen final sin node_modules completo
# ADR F0-014: turbo prune, non-root, pinned versions

# ─────────────────────────────────────────────
# Stage 0: base
# ─────────────────────────────────────────────
FROM node:22.22.2-alpine3.22 AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@11.2.2
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — sub-repo mínimo para @octo/web
# ─────────────────────────────────────────────
FROM base AS pruner
# Use the same turbo version pinned in the monorepo root and install it via
# npm, which is already available in this stage and behaves more predictably
# than pnpm global installs in constrained container builders like Coolify.
RUN npm install -g turbo@2.9.16
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
# Ensure the public directory exists even when the app has no committed public assets.
RUN mkdir -p /app/apps/web/public
# Next.js standalone output requiere NEXT_TELEMETRY_DISABLED en build
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo build --filter=@octo/web

# ─────────────────────────────────────────────
# Stage 3: runner — Next.js standalone
# ─────────────────────────────────────────────
FROM node:22.22.2-alpine3.22 AS runner
# The runtime image does not need npm; removing it drops bundled npm dependency scan findings.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/npm-cli.js \
    /usr/local/bin/npx-cli.js \
    /usr/local/bin/npm-prefix.js
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
ARG BUILD_PHASE=F1
ARG BUILD_TIME=unknown

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME}

CMD ["node", "apps/web/server.js"]
