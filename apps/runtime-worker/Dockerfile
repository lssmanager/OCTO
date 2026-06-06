# apps/runtime-worker/Dockerfile
# Port: 8000 | Service: octo-runtime-worker (Python/FastAPI)
#
# OCTO Execution Plane — isolated from the NestJS Control Plane.
# This service MUST run in a separate process from the API.
# See Architectural Principle #2: Runtime is isolated.
#
# BUILD CONTEXT: apps/runtime-worker/ (or repo root with this path)
# SECURITY: Inject runtime secrets via Coolify env vars (Runtime tab).
# No secrets in ARG or ENV during build.

# syntax=docker/dockerfile:1.4

# ─────────────────────────────────────────────
# Stage 0: base — Python 3.12 slim
# ─────────────────────────────────────────────
FROM python:3.12.8-slim-bookworm AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# ─────────────────────────────────────────────
# Stage 1: builder — install dependencies
# ─────────────────────────────────────────────
FROM base AS builder

WORKDIR /app

COPY apps/runtime-worker/requirements.txt ./requirements.txt

RUN pip install --prefix=/install -r requirements.txt

# ─────────────────────────────────────────────
# Stage 2: runner — minimal production image
# ─────────────────────────────────────────────
FROM base AS runner

RUN groupadd --system --gid 1001 octo \
 && useradd --system --uid 1001 --gid octo --no-create-home octo

WORKDIR /app

COPY --from=builder /install /usr/local
COPY --chown=octo:octo apps/runtime-worker/src ./src
COPY --chown=octo:octo apps/runtime-worker/pyproject.toml ./pyproject.toml

USER octo

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health/live || exit 1

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    PYTHONPATH=/app

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
