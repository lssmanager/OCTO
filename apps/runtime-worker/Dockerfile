# apps/runtime-worker/Dockerfile
# Multi-stage Python: builder → runner
#
# uv para instalación rápida (10-100x más rápido que pip).
# Imagen final: python:3.12.7-slim-bookworm sin build tools.
# Non-root uid=1001, HEALTHCHECK nativo.
#
# Build (context = apps/runtime-worker):
#   docker build -f apps/runtime-worker/Dockerfile \
#     --build-arg BUILD_VERSION=0.0.1-f0 \
#     --build-arg BUILD_COMMIT=$(git rev-parse --short HEAD) \
#     apps/runtime-worker

# ── Stage 1: Install Python deps ─────────────────────────────────────────────
FROM python:3.12.7-slim-bookworm AS builder

# uv: instalador de paquetes Python ultra-rápido (Rust)
# Pinneado para builds reproducibles
RUN pip install --no-cache-dir uv==0.5.4

WORKDIR /app
COPY requirements.txt .

# --system: instala en el Python del sistema (no virtualenv)
# --no-cache: evita guardar cache de wheels en la imagen builder
RUN uv pip install --system --no-cache -r requirements.txt

# ── Stage 2: Runtime image ───────────────────────────────────────────────────
FROM python:3.12.7-slim-bookworm AS runner

# Non-root user
RUN groupadd --gid 1001 octo \
  && useradd --uid 1001 --gid 1001 --no-create-home --shell /bin/false octo

# curl para HEALTHCHECK
RUN apt-get update \
  && apt-get install -y --no-install-recommends curl \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copiar solo site-packages compilados (sin uv, sin build tools)
COPY --from=builder /usr/local/lib/python3.12/site-packages /usr/local/lib/python3.12/site-packages
COPY --from=builder /usr/local/bin/uvicorn /usr/local/bin/uvicorn
COPY --from=builder /usr/local/bin/gunicorn /usr/local/bin/gunicorn

# Source de la aplicación
COPY --chown=octo:octo src/ ./src/

USER octo

EXPOSE 8000

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

# 1 worker en F0: el runtime-worker es stateless, el escalado horizontal
# se hace con réplicas de contenedor (Coolify), no con workers uvicorn.
CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1"]
