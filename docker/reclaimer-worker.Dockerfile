# apps/reclaimer-worker/Dockerfile
# Issue #34 — Reclaimer worker container
#
# Multi-stage build:
#   builder — installs deps + compiles TypeScript
#   runner  — minimal production image (node:22-alpine)
#
# Constraint: NO @nestjs/* — plain Node.js process only

# ---- builder ----
FROM node:22-alpine AS builder
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

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
FROM node:22-alpine AS runner
WORKDIR /app

# Non-root user
RUN addgroup -S octo && adduser -S reclaimer -G octo
USER reclaimer

# Copy compiled output only
COPY --from=builder --chown=reclaimer:octo /app/apps/reclaimer-worker/dist ./dist
COPY --from=builder --chown=reclaimer:octo /app/node_modules               ./node_modules

ENV NODE_ENV=production
EXPOSE 3011

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3011/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--enable-source-maps", "dist/index.js"]
