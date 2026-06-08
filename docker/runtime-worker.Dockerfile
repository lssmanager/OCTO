# syntax=docker/dockerfile:1.7
FROM python:3.12.8-slim-bookworm AS builder
WORKDIR /app
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
COPY apps/runtime-worker/requirements.txt ./requirements.txt
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12.8-slim-bookworm AS runtime
ARG VERSION=0.0.0
ARG REVISION=unknown
ARG CREATED=unknown
LABEL org.opencontainers.image.title="octo/runtime-worker" \
      org.opencontainers.image.description="OCTO Runtime Worker" \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.revision="${REVISION}" \
      org.opencontainers.image.created="${CREATED}" \
      org.opencontainers.image.source="https://github.com/lssmanager/OCTO" \
      org.opencontainers.image.licenses="Proprietary"
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
RUN groupadd --system --gid 1001 octo && useradd --system --uid 1001 --gid 1001 octo
WORKDIR /app
COPY --from=builder /install /usr/local
COPY --chown=1001:1001 apps/runtime-worker/src ./src
COPY --chown=1001:1001 apps/runtime-worker/app ./app
USER 1001:1001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --retries=3 CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/health/live', timeout=3)"
CMD ["uvicorn","src.main:app","--host","0.0.0.0","--port","8000"]
