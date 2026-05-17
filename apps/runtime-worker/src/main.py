"""OCTO Runtime Worker — AI Execution Plane.

Architectural boundary (F0-002):
  THIS process handles ONLY: task execution, LLM interaction, tool
  execution, embeddings, reasoning, planning, memory retrieval.

  ZERO imports from NestJS / Node / TypeScript land.
  Communication with the Control Plane is exclusively via:
    - HTTP REST (inbound jobs from API) — prefix: /api/v1
    - BullMQ via Redis (async queue jobs)
    - WebSocket (streaming responses, future F2)
"""
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings
from .routers import execute, health, models
from .telemetry import configure_telemetry, instrument_app

settings = Settings()
configure_telemetry(settings)

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:  # noqa: ARG001
    log.info(
        "octo_runtime_worker.startup",
        service=settings.otel_service_name,
        trace_id="bootstrap",
        run_id="bootstrap",
        host=settings.host,
        port=settings.port,
        version=settings.otel_service_version,
        phase=settings.build_phase,
    )
    yield
    log.info(
        "octo_runtime_worker.shutdown",
        service=settings.otel_service_name,
        trace_id="bootstrap",
        run_id="bootstrap",
    )


app = FastAPI(
    title="OCTO Runtime Worker",
    description=(
        "AI Execution Plane — isolated from Control Plane (TypeScript/NestJS). "
        "Handles LLM execution, tool calls, embeddings, and agent reasoning."
    ),
    version=settings.otel_service_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.api_url],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# /health, /health/live, /health/ready, /health/version
app.include_router(health.router)

# /api/v1/execute  — execution plane HTTP contract (F0-002)
app.include_router(execute.router, prefix="/api/v1")

# /models — LiteLLM model listing
app.include_router(models.router)

instrument_app(app)
