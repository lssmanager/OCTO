"""OCTO Runtime Worker — AI Execution Plane.

Límite arquitectónico (Principio #1 + #2):
  ESTE proceso maneja ÚNICAMENTE: ejecución de tasks, interacción LLM,
  tool execution, embeddings, razonamiento, planificación, recuperación de memoria.

  CERO imports de NestJS / Node / TypeScript.
  Comunicación con el Control Plane EXCLUSIVAMENTE via:
    - HTTP REST (jobs entrantes del API)
    - BullMQ via Redis (jobs async)
    - WebSocket (streaming, futuro F2)

  NUNCA en este proceso:
    - Lógica de orquestación o scheduling
    - Evaluación de governance policies
    - Topología de agentes o delegation chains
    - Business rules del Control Plane
    - Escritura a la DB de autoridad (PostgreSQL)
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .observability import instrument_app, setup_logging, setup_tracing
from .routers import execution, health, models

# Fail-fast: si cualquier variable requerida falta o es inválida,
# pydantic-settings lanza ValidationError con TODOS los problemas a la vez.
# El proceso no arranca. Esto es intencional (F0-016, Principio de fail-fast).
_settings = get_settings()

# Setup logging primero para que los logs de startup sean estructurados
setup_logging(
    log_level=_settings.log_level,
    log_format=_settings.log_format,
)

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    # STARTUP
    setup_tracing(
        service_name=_settings.otel_service_name,
        otlp_endpoint=_settings.otel_exporter_otlp_endpoint,
        enabled=_settings.otel_enabled,
    )
    app.state.settings = _settings

    log.info(
        "octo_runtime_worker.startup",
        service=_settings.otel_service_name,
        version=_settings.otel_service_version,
        phase=_settings.build_phase,
        host=_settings.host,
        port=_settings.port,
        trace_id="bootstrap",
        run_id="bootstrap",
    )

    yield

    # SHUTDOWN
    log.info(
        "octo_runtime_worker.shutdown",
        service=_settings.otel_service_name,
        trace_id="bootstrap",
        run_id="bootstrap",
    )


app = FastAPI(
    title="OCTO Runtime Worker",
    description=(
        "AI Execution Plane — aislado del Control Plane (TypeScript/NestJS). "
        "Maneja ejecución LLM, tool calls, embeddings y razonamiento de agentes. "
        "Control Plane → Worker via HTTP/Queue. Worker → Control Plane via HTTP callback."
    ),
    version=_settings.otel_service_version,
    lifespan=lifespan,
    # Docs solo en no-producción (seguridad)
    docs_url=None if _settings.build_phase == "production" else "/docs",
    redoc_url=None if _settings.build_phase == "production" else "/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[_settings.api_url],
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID", "X-Internal-Secret"],
)

# Routers
app.include_router(health.router)               # GET /health, /health/live, /health/ready
app.include_router(execution.router, prefix="/api/v1")  # POST /api/v1/execute
app.include_router(models.router, prefix="/api/v1")     # GET  /api/v1/models

# OTEL FastAPI instrumentation
instrument_app(app)
