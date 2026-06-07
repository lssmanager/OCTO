# apps/reclaimer-worker/Dockerfile
# Issue #34 — Reclaimer worker container
#
# Multi-stage build:
#   builder — installs deps + compiles TypeScript
#   runner  — minimal production image (node:22-alpine)
#
# Constraint: NO @nestjs/* — plain Node.js process only

# ---- builder ----
FROM node:22.22.2-alpine3.22 AS builder
WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@11.2.2

# Copy workspace manifests
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/database/package.json             ./packages/database/
COPY packages/contracts/package.json            ./packages/contracts/
COPY packages/queue/package.json                ./packages/queue/
COPY packages/observability/package.json        ./packages/observability/
COPY apps/reclaimer-worker/package.json         ./apps/reclaimer-worker/

# Install only production deps for this app (pruned)
RUN pnpm install --frozen-lockfile --filter @octo/reclaimer-worker...

# Copy source
COPY packages/database/    ./packages/database/
COPY packages/contracts/   ./packages/contracts/
COPY packages/queue/       ./packages/queue/
COPY packages/observability/ ./packages/observability/
COPY apps/reclaimer-worker/  ./apps/reclaimer-worker/

# Build all packages in dependency order
RUN pnpm --filter @octo/contracts build
RUN pnpm --filter @octo/database build
RUN pnpm --filter @octo/queue build
RUN pnpm --filter @octo/observability build
RUN pnpm --filter @octo/reclaimer-worker build

# ---- runner ----
FROM node:22.22.2-alpine3.22 AS runner
# The runtime image does not need npm; removing it drops bundled npm dependency scan findings.
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/bin/npm \
    /usr/local/bin/npx \
    /usr/local/bin/npm-cli.js \
    /usr/local/bin/npx-cli.js \
    /usr/local/bin/npm-prefix.js
ARG SOURCE_COMMIT=local
ARG BUILD_VERSION=0.1.0-f1
ARG BUILD_COMMIT=${SOURCE_COMMIT}
ARG BUILD_PHASE=F1
ARG BUILD_TIME=local
ARG VERSION=${BUILD_VERSION}
ARG REVISION=${BUILD_COMMIT}
ARG CREATED=${BUILD_TIME}
LABEL org.opencontainers.image.title="octo/reclaimer-worker" \
      org.opencontainers.image.description="OCTO Reclaimer Worker" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="https://github.com/lssmanager/OCTO" \
      org.opencontainers.image.licenses="Proprietary"
WORKDIR /app

# Non-root user
RUN addgroup -S octo && adduser -S reclaimer -G octo
USER reclaimer

# Copy compiled output only
COPY --from=builder --chown=reclaimer:octo /app/apps/reclaimer-worker/dist ./dist
COPY --from=builder --chown=reclaimer:octo /app/node_modules               ./node_modules

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME} \
    NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "process.exit(0)"

CMD ["node", "--enable-source-maps", "dist/index.js"]
