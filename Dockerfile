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
#
# WHY we copy packages/*/node_modules:
#   pnpm uses a virtual store + symlinks. After `pnpm install` in the
#   builder stage, some peer deps and non-hoisted packages (e.g.
#   drizzle-orm/postgres-js, postgres) end up in package-level
#   node_modules (packages/database/node_modules/, etc.) rather than
#   the root /app/node_modules. Copying only the root node_modules
#   causes MODULE_NOT_FOUND for those packages at runtime.
#
#   Copying packages/*/node_modules alongside packages/*/dist
#   ensures every package can resolve its own direct dependencies
#   regardless of hoisting decisions.
#
# WHY CMD runs packages/database/dist/migrate.js (not apps/api/dist/migrate.js):
#   migrate.ts imports drizzle-orm/postgres-js directly. drizzle-orm is a
#   dependency of @octo/database — pnpm installs it in
#   packages/database/node_modules, NOT in the root /app/node_modules.
#   Running the script from packages/database/dist means Node resolves
#   require('drizzle-orm/postgres-js') relative to packages/database,
#   where the module is guaranteed to exist.
# ─────────────────────────────────────────────
FROM node:22.16.0-alpine3.21 AS runner
RUN apk add --no-cache libc6-compat curl

RUN addgroup --system --gid 1001 octo \
 && adduser --system --uid 1001 --ingroup octo octo

WORKDIR /app

# App dist + manifest
COPY --from=builder --chown=octo:octo /app/apps/api/dist ./dist
COPY --from=builder --chown=octo:octo /app/apps/api/package.json ./

# Root hoisted node_modules (most dependencies live here)
COPY --from=builder --chown=octo:octo /app/node_modules ./node_modules

# Internal packages: built output + their own node_modules
# (non-hoisted deps like drizzle-orm/postgres-js, postgres, etc.
#  are installed at the package level by pnpm, not at the root)
COPY --from=builder --chown=octo:octo /app/packages ./packages

# Package-level node_modules (pnpm non-hoisted deps)
# Each package that has its own node_modules gets it copied explicitly.
# This is a belt-and-suspenders copy on top of the packages/ copy above;
# it ensures node_modules directories are preserved even if the shell
# glob in the COPY above is subject to .dockerignore exclusions.
COPY --from=builder --chown=octo:octo /app/packages/database/node_modules ./packages/database/node_modules
COPY --from=builder --chown=octo:octo /app/packages/observability/node_modules ./packages/observability/node_modules
COPY --from=builder --chown=octo:octo /app/packages/queue/node_modules ./packages/queue/node_modules
COPY --from=builder --chown=octo:octo /app/packages/runtime-state/node_modules ./packages/runtime-state/node_modules
COPY --from=builder --chown=octo:octo /app/packages/security/node_modules ./packages/security/node_modules
COPY --from=builder --chown=octo:octo /app/packages/contracts/node_modules ./packages/contracts/node_modules

# Migration SQL files — needed by packages/database/dist/migrate.js at runtime.
# Resolved as path.join(__dirname, '..', 'migrations') from dist/migrate.js
# → /app/packages/database/migrations (already included via packages/ copy above,
#   but listed explicitly to document the dependency and guard against future
#   .dockerignore changes that might exclude non-JS assets).
COPY --from=builder --chown=octo:octo /app/packages/database/migrations ./packages/database/migrations

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

# migrate.js runs first from packages/database/dist so Node resolves
# drizzle-orm/postgres-js from packages/database/node_modules (where pnpm
# actually installs it). If migrate.js exits non-zero, main.js never starts.
CMD ["sh", "-c", "node packages/database/dist/migrate.js && node dist/main.js"]
