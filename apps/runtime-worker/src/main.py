"""OCTO Runtime Worker — AI Execution Plane bootstrap.

Architectural boundary (F0-002 / ABSOLUTE PRINCIPLE 1):
  THIS process handles ONLY: task execution, LLM interaction, tool
  execution, embeddings, reasoning, planning, memory retrieval.

  ZERO imports from NestJS / Node / TypeScript land.
  Communication with the Control Plane is exclusively via:
    - HTTP REST (inbound jobs from Control Plane) — prefix: /api/v1
    - BullMQ via Redis (async queue jobs)         — future F1+
    - WebSocket (streaming responses)             — future F2+

Bootstrap sequence (C4):
  1. Load Settings (pydantic-settings v2, fails fast on missing vars)
  2. configure_telemetry() — logging + tracing + metrics (before app creation)
  3. Create FastAPI app with lifespan context manager
  4. Register OS signal handlers (SIGTERM, SIGINT) for graceful shutdown
  5. Mount routers
  6. instrument_app() — FastAPI OTel auto-instrumentation

Graceful shutdown sequence:
  SIGTERM/SIGINT received
  → _shutdown_event.set()
  → lifespan teardown block runs:
      - log shutdown start
      - wait for in-flight requests (SHUTDOWN_TIMEOUT_SECS)
      - flush + shutdown TracerProvider (no lost spans)
      - log shutdown complete
"""
import asyncio
import os
import signal
import threading
from contextlib import asynccontextmanager
from typing import AsyncGenerator

import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import Settings
from .routers import execute, health, models
from .telemetry import configure_telemetry, instrument_app, shutdown_telemetry

# ── Settings ──────────────────────────────────────────────────────────────────
# Instantiated once at module level; pydantic raises ValidationError
# immediately if any required env var is missing.
settings = Settings()

# ── Telemetry (MUST precede app creation) ─────────────────────────────────────
configure_telemetry(settings)

log = structlog.get_logger(__name__)

# ── Shutdown coordination ─────────────────────────────────────────────────────
# A threading.Event is used because signal handlers run in the main thread;
# asyncio tasks use `asyncio.get_event_loop().run_in_executor` to await it
# without blocking the event loop.
_shutdown_event: threading.Event = threading.Event()

SHUTDOWN_TIMEOUT_SECS: int = int(os.environ.get("SHUTDOWN_TIMEOUT_SECS", "30"))
METRICS_PORT: int = int(os.environ.get("METRICS_PORT", "9464"))


def _handle_signal(signum: int, _frame: object) -> None:  # noqa: ANN401
    """OS signal handler — triggers graceful shutdown."""
    sig_name = signal.Signals(signum).name
    # structlog is not async-safe in signal context; use stdlib print.
    print(f"[runtime-worker] received {sig_name} — initiating graceful shutdown", flush=True)
    _shutdown_event.set()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:  # noqa: ARG001
    """Application lifespan — startup and graceful shutdown."""
    # ── Register OS signal handlers ────────────────────────────────────────
    signal.signal(signal.SIGTERM, _handle_signal)
    signal.signal(signal.SIGINT, _handle_signal)

    # ── Start Prometheus HTTP server (separate port) ───────────────────────
    # Lazy import so the metrics server only starts if prometheus_client
    # is installed. The /metrics endpoint is scraped by Prometheus/Grafana.
    try:
        import prometheus_client  # type: ignore[import-untyped]
        prometheus_client.start_http_server(METRICS_PORT)
        log.info(
            "octo_runtime_worker.metrics_server_started",
            trace_id="bootstrap",
            run_id="bootstrap",
            metrics_port=METRICS_PORT,
        )
    except ImportError:
        log.warning(
            "octo_runtime_worker.prometheus_client_not_installed",
            trace_id="bootstrap",
            run_id="bootstrap",
            msg="Prometheus metrics endpoint unavailable",
        )

    log.info(
        "octo_runtime_worker.startup",
        trace_id="bootstrap",
        run_id="bootstrap",
        service=settings.otel_service_name,
        host=settings.host,
        port=settings.port,
        metrics_port=METRICS_PORT,
        version=settings.build_version,
        commit=settings.build_commit,
        phase=settings.build_phase,
        max_concurrent_executions=settings.max_concurrent_executions,
        execution_timeout_secs=settings.execution_timeout_secs,
        otel_enabled=settings.otel_enabled,
    )

    # ── Yield: application is running ─────────────────────────────────────
    yield

    # ── Teardown ──────────────────────────────────────────────────────────
    log.info(
        "octo_runtime_worker.shutdown_initiated",
        trace_id="bootstrap",
        run_id="bootstrap",
        timeout_secs=SHUTDOWN_TIMEOUT_SECS,
    )

    # Wait for in-flight requests to drain.
    # _shutdown_event may already be set (SIGTERM path) or not set (normal
    # Uvicorn shutdown initiated by the process manager — still safe to wait
    # a moment for in-flight requests).
    loop = asyncio.get_event_loop()
    try:
        await asyncio.wait_for(
            loop.run_in_executor(None, _shutdown_event.wait),
            timeout=float(SHUTDOWN_TIMEOUT_SECS),
        )
    except asyncio.TimeoutError:
        log.warning(
            "octo_runtime_worker.shutdown_timeout",
            trace_id="bootstrap",
            run_id="bootstrap",
            timeout_secs=SHUTDOWN_TIMEOUT_SECS,
            msg="Graceful shutdown timed out — forcing exit",
        )

    # Flush and close OTel TracerProvider so no spans are lost.
    shutdown_telemetry(settings)

    log.info(
        "octo_runtime_worker.shutdown_complete",
        trace_id="bootstrap",
        run_id="bootstrap",
    )


# ── FastAPI application ────────────────────────────────────────────────────────
app = FastAPI(
    title="OCTO Runtime Worker",
    description=(
        "AI Execution Plane — isolated from Control Plane (TypeScript/NestJS). "
        "Handles LLM execution, tool calls, embeddings, and agent reasoning. "
        "All orchestration logic lives in the NestJS Control Plane."
    ),
    version=settings.build_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    # Disable default exception handler to allow structured error logging.
    # Re-added below as a custom handler that logs with structlog.
    generate_unique_id_function=lambda route: f"{route.tags[0] if route.tags else 'default'}:{route.name}",
)

# ── CORS ──────────────────────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.api_url],
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["Authorization", "Content-Type", "X-Request-ID"],
)


# ── X-Request-ID middleware ────────────────────────────────────────────────────
@app.middleware("http")
async def request_id_middleware(request: Request, call_next):  # type: ignore[no-untyped-def]
    """Stamp X-Request-ID into structlog context vars for every request."""
    import uuid
    request_id = request.headers.get("X-Request-ID", str(uuid.uuid4()))
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(request_id=request_id)
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


# ── Unhandled exception handler ────────────────────────────────────────────────
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error(
        "octo_runtime_worker.unhandled_exception",
        path=str(request.url.path),
        method=request.method,
        error=str(exc),
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "error": "internal_server_error",
            "message": "An unexpected error occurred in the runtime worker.",
        },
    )


# ── Routers ────────────────────────────────────────────────────────────────────
# /health, /health/live, /health/ready, /health/version, /health/worker
app.include_router(health.router)

# /api/v1/execute — execution plane HTTP contract (F0-002)
app.include_router(execute.router, prefix="/api/v1")

# /models — LiteLLM model listing
app.include_router(models.router)

# ── OTel auto-instrumentation (must be last, after all routers are mounted) ───
instrument_app(app)
