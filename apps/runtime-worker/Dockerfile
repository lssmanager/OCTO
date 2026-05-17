# apps/runtime-worker/Dockerfile
# Python multi-stage: builder -> runner
# uv para instalación de deps (10x más rápido que pip)
# ADR F0-014: non-root, pinned versions, HEALTHCHECK
# Build context: apps/runtime-worker/

# ─────────────────────────────────────────────
# Stage 1: builder — instala dependencias con uv
# ─────────────────────────────────────────────
FROM python:3.12.7-slim-bookworm AS builder

RUN pip install --no-cache-dir uv==0.5.4

WORKDIR /app
COPY requirements.txt .
RUN uv pip install --system --no-cache -r requirements.txt

# ─────────────────────────────────────────────
# Stage 2: runner — imagen final mínima
# Sin build tools, sin cache de pip/uv
# ─────────────────────────────────────────────
FROM python:3.12.7-slim-bookworm AS runner

# Non-root user (security — uid=1001)
RUN groupadd --gid 1001 octo \
    && useradd --uid 1001 --gid octo --no-create-home octo

# curl para HEALTHCHECK
RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar site-packages y binarios del builder
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin /usr/local/bin

# Copiar source de la aplicación
COPY --chown=octo:octo src/ ./src/

USER octo

EXPOSE 8000

# Health check nativo Docker
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

ARG BUILD_VERSION=unknown
ARG BUILD_COMMIT=unknown
ARG BUILD_PHASE=F0

ENV BUILD_VERSION=${BUILD_VERSION} \
    BUILD_COMMIT=${BUILD_COMMIT} \
    BUILD_PHASE=${BUILD_PHASE} \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# uvicorn en modo single-worker (F0)
# Producción: escalar vía réplicas de contenedor, no workers internos
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
