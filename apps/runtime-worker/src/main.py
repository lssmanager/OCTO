"""OCTO Runtime Worker — AI Execution Plane.

Architectural boundary (F0-002):
  THIS process handles ONLY: task execution, LLM interaction, tool
  execution, embeddings, reasoning, planning, memory retrieval.

  ZERO imports from NestJS / Node / TypeScript land.
  Communication with the Control Plane is exclusively via:
    - HTTP REST (inbound jobs from API)
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

# Instantiate settings at module level — pydantic-settings reads env/file here
settings = Settings()

# Bootstrap telemetry BEFORE any other I/O
configure_telemetry(settings)

log = structlog.get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:  # noqa: ARG001
    """Application lifespan: startup → yield → shutdown."""
    log.info(
        "octo_runtime_worker.startup",
        host=settings.host,
        port=settings.port,
        service=settings.otel_service_name,
        version=settings.otel_service_version,
    )
    yield
    log.info("octo_runtime_worker.shutdown")


app = FastAPI(
    title="OCTO Runtime Worker",
    description=(
        "AI Execution Plane — isolated from Control Plane (TypeScript/NestJS). "
        "Handles LLM execution, tool calls, embeddings, and agent reasoning."
    ),
    version=settings.otel_service_version,
    lifespan=lifespan,
    # Disable docs in production via env — override with FASTAPI_DOCS_URL
    docs_url="/docs",
    redoc_url="/redoc",
)

# ── CORS: only allow the Control Plane origin ─────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.api_url],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(health.router)
app.include_router(execute.router)
app.include_router(models.router)

# ── OTEL FastAPI auto-instrumentation ────────────────────────────────────────
instrument_app(app)
