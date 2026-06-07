"""Health endpoints for OCTO Runtime Worker (C4).

Endpoints:
  GET /health           - public process liveness, no operational details
  GET /health/live      - public liveness probe (always 200 if process alive)
  GET /health/ready     - public readiness probe (503 if any dependency down)
  GET /health/status    - internal detailed dependency and heartbeat status
  GET /health/worker    - internal process-level snapshot
  GET /health/version   - internal build metadata
  GET /health/metrics-url - internal Prometheus scrape URL for Grafana auto-discovery

Public probe endpoints are limited to minimal responses: /health and
/health/live prove process liveness, and /health/ready returns only a boolean
readiness outcome with no dependency evidence. Detailed status, version, worker
and metrics discovery endpoints require the Control Plane shared
X-Internal-Secret because they expose topology and dependency evidence useful to
attackers if the worker is ever accidentally reachable.
"""
from __future__ import annotations

import asyncio
import hmac
import os
import time
from typing import Any

import httpx
import structlog
from fastapi import APIRouter, Header, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from ..config import Settings
from ..f1_runtime import runtime_database_url

log = structlog.get_logger(__name__)

# Process start time for uptime calculation.
_PROCESS_START: float = time.monotonic()

# Active execution counter - incremented/decremented by the execution service.
# A simple int is used here; in F1+ this will be a proper async counter
# backed by the ExecutionService.
_active_executions: int = 0

router = APIRouter(prefix="/health", tags=["health"])
_settings = Settings()


class DependencyCheck(BaseModel):
    status: str          # 'ok' | 'error' | 'degraded'
    latency_ms: float | None = None
    detail: str | None = None


class HealthResponse(BaseModel):
    status: str          # 'ok' | 'error' | 'degraded'
    timestamp: str
    service: str
    version: str
    phase: str
    checks: dict[str, DependencyCheck]


class PublicProbeResponse(BaseModel):
    status: str
    timestamp: str


class PublicReadinessResponse(PublicProbeResponse):
    ready: bool


class WorkerHealthResponse(BaseModel):
    status: str
    pid: int
    uptime_secs: float
    memory_rss_mb: float
    active_executions: int
    max_concurrent_executions: int
    worker_id: str
    version: str
    commit: str
    phase: str
    metrics_port: int
    timestamp: str


async def _check_redis() -> DependencyCheck:
    redis_url = os.environ.get("REDIS_URL", "redis://redis:6379")
    import importlib
    try:
        redis_lib = importlib.import_module("redis.asyncio")
        client = redis_lib.from_url(redis_url, socket_connect_timeout=2)
        t0 = time.monotonic()
        await client.ping()
        latency = (time.monotonic() - t0) * 1000
        await client.aclose()
        return DependencyCheck(status="ok", latency_ms=round(latency, 2))
    except Exception as exc:  # noqa: BLE001
        return DependencyCheck(status="error", detail=str(exc))


async def _check_database() -> DependencyCheck:
    try:
        db_url = runtime_database_url()
    except Exception as exc:  # noqa: BLE001
        return DependencyCheck(status="error", detail=str(exc))
    try:
        import asyncpg  # type: ignore[import-untyped]
        t0 = time.monotonic()
        conn = await asyncpg.connect(db_url, timeout=3)
        await conn.fetchval("SELECT 1")
        latency = (time.monotonic() - t0) * 1000
        await conn.close()
        return DependencyCheck(status="ok", latency_ms=round(latency, 2))
    except Exception as exc:  # noqa: BLE001
        return DependencyCheck(status="error", detail=str(exc))


async def _check_litellm() -> DependencyCheck:
    litellm_url = os.environ.get("LITELLM_URL", "http://litellm:4000")
    try:
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{litellm_url}/health")
        latency = (time.monotonic() - t0) * 1000
        if resp.status_code < 400:
            return DependencyCheck(status="ok", latency_ms=round(latency, 2))
        return DependencyCheck(
            status="degraded",
            latency_ms=round(latency, 2),
            detail=f"HTTP {resp.status_code}",
        )
    except Exception as exc:  # noqa: BLE001
        return DependencyCheck(status="error", detail=str(exc))


async def _check_control_plane() -> DependencyCheck:
    api_url = os.environ.get("API_URL", "http://api:3001/api")
    try:
        t0 = time.monotonic()
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{api_url}/health/live")
        latency = (time.monotonic() - t0) * 1000
        if resp.status_code == 200:
            return DependencyCheck(status="ok", latency_ms=round(latency, 2))
        return DependencyCheck(
            status="degraded",
            latency_ms=round(latency, 2),
            detail=f"HTTP {resp.status_code}",
        )
    except Exception as exc:  # noqa: BLE001
        return DependencyCheck(status="error", detail=str(exc))


async def _run_all_checks() -> dict[str, DependencyCheck]:
    redis_check, db_check, litellm_check, cp_check = await asyncio.gather(
        _check_redis(),
        _check_database(),
        _check_litellm(),
        _check_control_plane(),
    )
    return {
        "redis": redis_check,
        "database": db_check,
        "litellm": litellm_check,
        "control_plane": cp_check,
        "runtime_worker": DependencyCheck(status="ok"),
    }


async def _latest_runtime_heartbeat() -> dict[str, Any] | None:
    try:
        import asyncpg  # type: ignore[import-untyped]

        conn = await asyncpg.connect(runtime_database_url(), timeout=3)
        try:
            row = await conn.fetchrow(
                """
                SELECT
                  instance_id, status, started_at, last_heartbeat_at,
                  version, commit_sha, metadata, error
                FROM worker_heartbeats
                WHERE worker_type='runtime-worker'
                ORDER BY last_heartbeat_at DESC
                LIMIT 1
                """
            )
        finally:
            await conn.close()
        if row is None:
            return None
        heartbeat = dict(row)
        for key in ("started_at", "last_heartbeat_at"):
            if heartbeat.get(key) is not None:
                heartbeat[key] = heartbeat[key].isoformat()
        return heartbeat
    except Exception as exc:  # noqa: BLE001
        return {"status": "error", "error": str(exc)}


def _verify_internal_secret(x_internal_secret: str | None) -> None:
    """Protect internal health and ops surfaces with the shared service secret."""
    if x_internal_secret is None or not hmac.compare_digest(
        x_internal_secret, _settings.api_internal_secret
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal secret",
        )


def _overall_status(checks: dict[str, DependencyCheck]) -> str:
    statuses = {c.status for c in checks.values()}
    if "error" in statuses:
        return "error"
    if "degraded" in statuses:
        return "degraded"
    return "ok"


@router.get("", response_model=PublicProbeResponse)
async def health_check() -> PublicProbeResponse:
    """Public process liveness. No dependency or build details."""
    import datetime

    return PublicProbeResponse(
        status="ok",
        timestamp=datetime.datetime.utcnow().isoformat() + "Z",
    )


@router.get("/live", response_model=PublicProbeResponse)
async def liveness() -> PublicProbeResponse:
    """Liveness probe - 200 if the process is alive."""
    import datetime

    return PublicProbeResponse(
        status="ok",
        timestamp=datetime.datetime.utcnow().isoformat() + "Z",
    )


@router.get("/ready", response_model=PublicReadinessResponse)
async def readiness() -> JSONResponse:
    """Readiness probe - 200 when all dependencies healthy, 503 otherwise."""
    import datetime

    checks = await _run_all_checks()
    all_ok = all(c.status == "ok" for c in checks.values())
    status_code = 200 if all_ok else 503
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "ok" if all_ok else "not_ready",
            "ready": all_ok,
            "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        },
    )


@router.get("/worker", response_model=WorkerHealthResponse)
async def worker_health(
    x_internal_secret: str | None = Header(default=None),
) -> WorkerHealthResponse:
    """Process-level health snapshot.

    Returns runtime metrics for this specific worker process:
    - pid and uptime for process identity
    - memory_rss_mb for leak detection
    - active_executions for saturation monitoring
    - worker_id for multi-replica correlation in Grafana
    """
    _verify_internal_secret(x_internal_secret)
    import datetime

    import psutil  # type: ignore[import-untyped]

    proc = psutil.Process()
    mem_info = proc.memory_info()
    memory_rss_mb = mem_info.rss / (1024 * 1024)

    return WorkerHealthResponse(
        status="ok",
        pid=os.getpid(),
        uptime_secs=round(time.monotonic() - _PROCESS_START, 2),
        memory_rss_mb=round(memory_rss_mb, 2),
        active_executions=_active_executions,
        max_concurrent_executions=int(
            os.environ.get("MAX_CONCURRENT_EXECUTIONS", "10")
        ),
        worker_id=os.environ.get("WORKER_ID", f"worker-{os.getpid()}"),
        version=os.environ.get("BUILD_VERSION", "unknown"),
        commit=os.environ.get("BUILD_COMMIT", "unknown"),
        phase=os.environ.get("BUILD_PHASE", "F0"),
        metrics_port=int(os.environ.get("METRICS_PORT", "9464")),
        timestamp=datetime.datetime.utcnow().isoformat() + "Z",
    )


@router.get("/status")
async def runtime_status(
    x_internal_secret: str | None = Header(default=None),
) -> dict[str, Any]:
    """F1 operational status for runtime-worker evidence and close gates."""
    _verify_internal_secret(x_internal_secret)
    import datetime

    checks = await _run_all_checks()
    heartbeat = await _latest_runtime_heartbeat()
    return {
        "status": _overall_status(checks),
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "service": os.environ.get("OTEL_SERVICE_NAME", "octo-runtime-worker"),
        "workerType": "runtime-worker",
        "workerId": os.environ.get("WORKER_ID", f"worker-{os.getpid()}"),
        "env": os.environ.get("NODE_ENV", "development"),
        "phase": os.environ.get("BUILD_PHASE", "F0"),
        "version": os.environ.get("BUILD_VERSION", "unknown"),
        "commit": os.environ.get("BUILD_COMMIT", "unknown"),
        "database": {
            "credential": (
                "RUNTIME_DATABASE_URL"
                if os.environ.get("RUNTIME_DATABASE_URL")
                else "DATABASE_URL-fallback"
            ),
            "runtimeDatabaseUrlConfigured": bool(os.environ.get("RUNTIME_DATABASE_URL")),
            "check": checks["database"].model_dump(),
        },
        "heartbeat": heartbeat,
        "checks": {k: v.model_dump() for k, v in checks.items()},
    }


@router.get("/version")
async def version_info(
    x_internal_secret: str | None = Header(default=None),
) -> dict[str, str]:
    """Build metadata. Exposes image build-time ARG and ENV vars."""
    _verify_internal_secret(x_internal_secret)
    import sys

    return {
        "service": os.environ.get("OTEL_SERVICE_NAME", "octo-runtime-worker"),
        "version": os.environ.get("BUILD_VERSION", "unknown"),
        "commit": os.environ.get("BUILD_COMMIT", "unknown"),
        "phase": os.environ.get("BUILD_PHASE", "F0"),
        "built_at": os.environ.get("BUILD_TIME", "unknown"),
        "python": sys.version,
    }


@router.get("/metrics-url")
async def metrics_url(
    x_internal_secret: str | None = Header(default=None),
) -> dict[str, str]:
    """Returns the Prometheus scrape URL for Grafana auto-discovery."""
    _verify_internal_secret(x_internal_secret)
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("METRICS_PORT", "9464"))
    return {
        "url": f"http://{host}:{port}/metrics",
        "format": "prometheus",
        "note": "Scraped by Prometheus via prometheus_client.start_http_server()",
    }
