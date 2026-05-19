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
#
# node:22.16.0-alpine3.21 — Node 22 LTS (current).
# Minimum required by eslint-visitor-keys@5.0.1: ^22.13.0
# ─────────────────────────────────────────────
FROM node:22.16.0-alpine3.21 AS base
RUN apk add --no-cache libc6-compat
RUN npm install -g pnpm@10.32.1
ENV PNPM_HOME="/root/.local/share/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
WORKDIR /app

# ─────────────────────────────────────────────
# Stage 1: pruner — generates minimal sub-repo for @octo/api
#
# ARG NODE_ENV=development — declared BEFORE pnpm install so it wins
# over any external --build-arg NODE_ENV=production injected by Coolify.
# pnpm respects NODE_ENV for devDependency installation; if it sees
# "production" here it silently skips devDeps, breaking turbo build.
# ─────────────────────────────────────────────
FROM base AS pruner
ENV TURBO_TELEMETRY_DISABLED=1
# Force development so devDeps are included in the pruned output.
# This ENV overrides any external --build-arg at the stage level.
ENV NODE_ENV=development
COPY . .
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile
RUN pnpm dlx turbo@2.9.14 prune @octo/api --docker

# ─────────────────────────────────────────────
# Stage 2: builder — installs pruned sub-repo deps and compiles
#
# NODE_ENV=development MUST be set here too — same reason as pruner.
# TURBO_FORCE=1 — bypasses any stale remote/local turbo cache that
# could cause a phantom cache hit on a broken prior build.
# ─────────────────────────────────────────────
FROM base AS builder

ENV NODE_ENV=development
ENV TURBO_TELEMETRY_DISABLED=1

COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./pnpm-lock.yaml
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store \
    HUSKY=0 pnpm install --frozen-lockfile

COPY --from=pruner /app/out/full/ .

# Non-sensitive build metadata only — safe as ARG.
ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

RUN pnpm turbo build --filter=@octo/api

# ─────────────────────────────────────────────
# Stage 3: runner — minimal final image
# ─────────────────────────────────────────────
FROM node:22.16.0-alpine3.21 AS runner
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

HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD curl -f http://localhost:3001/api/health/live || exit 1

# Non-sensitive build metadata — stamped into the image at build time.
# Runtime secrets (DATABASE_URL, REDIS_URL, JWT_SECRET, etc.) must NEVER
# appear here. Inject via Coolify → Environment Variables → Runtime tab.
ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0
ARG BUILD_TIME=unknown

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    BUILD_TIME=${BUILD_TIME} \
    NODE_ENV=production

# migrate.js runs first: applies pending migrations then starts the API.
# If migrate.js exits non-zero, main.js is never started.
CMD ["sh", "-c", "node dist/migrate.js && node dist/main.js"]
