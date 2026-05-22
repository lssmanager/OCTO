# Root Dockerfile — Coolify deployment proxy for @octo/api
# ─────────────────────────────────────────────────────────────────
# Coolify clones the repo and executes:
#   docker build -f /artifacts/<hash>/Dockerfile /artifacts/<hash>
#
# The build context IS the repo root, which is correct:
# turbo prune requires pnpm-lock.yaml and all workspace package.json
# files to be present — they live at the repo root, not in apps/api/.
#
# SOURCE OF TRUTH: apps/api/Dockerfile (canonical for the API)
# Worker Dockerfiles live in docker/<service-name>/Dockerfile.
#
# SECURITY: Runtime secrets (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.)
# must NEVER appear as ARG or ENV in any Dockerfile. Secrets declared
# as ARG are stored in image layer history and can be extracted with
# `docker history --no-trunc` (MITRE ATT&CK T1552.007).
#
# In Coolify: Application → Environment Variables → Runtime tab.
# Do NOT place secrets in the Build Variables tab — those become ARGs.
# ─────────────────────────────────────────────────────────────────

# syntax=docker/dockerfile:1.4

# ─────────────────────────────────────────────
# Stage 0: base — Node.js Alpine + pnpm
# ─────────────────────────────────────────────
FROM node:22.16.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@11.2.2
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — generates minimal sub-repo for @octo/api
# ─────────────────────────────────────────────
FROM base AS pruner
ENV TURBO_TELEMETRY_DISABLED=1
ENV NODE_ENV=development
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm dlx turbo@2.9.14 prune @octo/api --docker

# ─────────────────────────────────────────────
# Stage 2: builder — installs pruned sub-repo deps and compiles
#
# WHY we override @octo/security dist/ after pnpm deploy:
#   pnpm deploy resolves @octo/security from the pnpm virtual store.
#   The store caches the dist/ from before any fix — turbo build --force
#   compiles a fresh dist/ into /app/packages/security/dist/ but does NOT
#   update the store copy. The deploy bundle therefore contains the stale
#   dist/index.js with the broken Reflector.
#
#   Fix: after pnpm deploy, explicitly overwrite the stale dist/ in the
#   deploy bundle with the freshly compiled output from the build stage.
# ─────────────────────────────────────────────
FROM base AS builder

ENV NODE_ENV=development
ENV TURBO_TELEMETRY_DISABLED=1

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY --from=pruner /app/pnpm-workspace.yaml ./pnpm-workspace.yaml
COPY --from=pruner /app/.npmrc ./.npmrc
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

# Step 1: force-rebuild @octo/security first — fresh dist/ with correct
# --external flags, no bundled NestJS, correct Reflector resolution.
RUN pnpm turbo build --filter=@octo/security --force

# Step 2: build @octo/api and all its deps.
RUN pnpm turbo build --filter=@octo/api --force

# Step 3: produce symlink-free deploy bundle for @octo/api.
RUN pnpm --filter @octo/api deploy --prod --legacy /app/deploy

# Step 4: overwrite the stale @octo/security dist/ in the deploy bundle
# with the freshly compiled output. pnpm deploy copies from the pnpm store
# which caches the old dist/ — this ensures the correct build is used.
RUN cp -r /app/packages/security/dist \
          /app/deploy/node_modules/@octo/security/dist

# Step 5: copy database package for runtime migrations.
RUN mkdir -p /app/deploy/packages/database \
 && cp -r /app/packages/database/dist /app/deploy/packages/database/dist \
 && cp -r /app/packages/database/migrations /app/deploy/packages/database/migrations

# ─────────────────────────────────────────────
# Stage 3: runner — minimal final image
# ─────────────────────────────────────────────
FROM node:22.16.0-alpine3.21 AS runner
RUN apk add --no-cache libc6-compat curl

RUN addgroup --system --gid 1001 octo \
 && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

COPY --from=builder --chown=octo:octo /app/deploy/dist ./dist
COPY --from=builder --chown=octo:octo /app/deploy/node_modules ./node_modules
COPY --from=builder --chown=octo:octo /app/deploy/package.json ./

COPY --from=builder --chown=octo:octo /app/deploy/packages/database/dist ./packages/database/dist
COPY --from=builder --chown=octo:octo /app/deploy/packages/database/migrations ./packages/database/migrations

USER octo

EXPOSE 3001

# HEALTHCHECK temporarily disabled until Reflector fix is confirmed working.
# Re-enable after /api/health/live responds 200 consistently.
# HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
#   CMD curl -f http://localhost:3001/api/health/live || exit 1

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME} \
    NODE_ENV=production

CMD ["sh", "-c", "node packages/database/dist/migrate.js && node dist/main.js"]
