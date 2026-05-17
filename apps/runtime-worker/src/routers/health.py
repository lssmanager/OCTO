"""Health router — liveness, readiness, and status probes.

Endpoints:
  GET /health/live    — liveness probe (is the process alive?)
  GET /health/ready   — readiness probe (503 when any critical dep is down)
  GET /health         — full status with dependency checks
  GET /health/version — service version info
"""
import time
from datetime import UTC, datetime

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter, Response

from ..config import Settings
from ..schemas import DependencyStatus, HealthDetail, HealthResponse

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/health", tags=["health"])
_settings = Settings()

_START_TIME = time.monotonic()
_VERSION = _settings.otel_service_version
_PHASE = _settings.build_phase


@router.get("/live", summary="Liveness probe")
async def liveness() -> dict[str, str]:
    """Returns 200 if the process is alive."""
    return {"status": "ok"}


@router.get("/ready", summary="Readiness probe")
async def readiness(response: Response) -> dict[str, object]:
    """Returns 200 only if all critical dependencies are reachable.

    Returns HTTP 503 Service Unavailable when any dependency is down.
    Load balancers and Coolify use this to gate traffic to the worker.
    """
    redis_ok = await _check_redis()
    litellm_ok = await _check_litellm()
    all_ok = redis_ok and litellm_ok

    if not all_ok:
        response.status_code = 503

    return {
        "status": "ready" if all_ok else "not_ready",
        "ready": all_ok,
        "timestamp": datetime.now(UTC).isoformat(),
        "checks": {
            "redis": redis_ok,
            "litellm": litellm_ok,
        },
    }


@router.get(
    "",
    response_model=HealthResponse,
    summary="Full health status",
)
async def health_status() -> HealthResponse:
    """Full health check with individual dependency statuses.

    Returns phase field so consumers can identify the platform milestone.
    Issue #11 criterion: GET /health must include {phase: "F0"}.
    """
    redis_check = await _check_redis_detail()
    litellm_check = await _check_litellm_detail()
    api_check = await _check_api_detail()

    all_ok = all(
        c.status == DependencyStatus.OK
        for c in [redis_check, litellm_check, api_check]
    )
    overall = DependencyStatus.OK if all_ok else DependencyStatus.DEGRADED

    return HealthResponse(
        status=overall,
        version=_VERSION,
        service=_settings.otel_service_name,
        phase=_PHASE,
        checks=[redis_check, litellm_check, api_check],
    )


@router.get("/version", summary="Service version")
async def version_info() -> dict[str, str | float]:
    """Returns version and uptime information."""
    return {
        "service": _settings.otel_service_name,
        "version": _VERSION,
        "phase": _PHASE,
        "uptime_seconds": round(time.monotonic() - _START_TIME, 2),
        "timestamp": datetime.now(UTC).isoformat(),
    }


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

async def _check_redis() -> bool:
    try:
        r = aioredis.from_url(_settings.redis_url, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        return True
    except Exception:  # noqa: BLE001
        return False


async def _check_litellm() -> bool:
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{_settings.litellm_url}/health")
            return resp.status_code < 500
    except Exception:  # noqa: BLE001
        return False


async def _check_redis_detail() -> HealthDetail:
    t0 = time.monotonic()
    try:
        r = aioredis.from_url(_settings.redis_url, socket_connect_timeout=2)
        await r.ping()
        await r.aclose()
        latency = int((time.monotonic() - t0) * 1000)
        return HealthDetail(name="redis", status=DependencyStatus.OK, latency_ms=latency)
    except Exception as exc:  # noqa: BLE001
        return HealthDetail(
            name="redis",
            status=DependencyStatus.DOWN,
            error=str(exc),
        )


async def _check_litellm_detail() -> HealthDetail:
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{_settings.litellm_url}/health")
            latency = int((time.monotonic() - t0) * 1000)
            status = DependencyStatus.OK if resp.status_code < 500 else DependencyStatus.DEGRADED
            return HealthDetail(name="litellm", status=status, latency_ms=latency)
    except Exception as exc:  # noqa: BLE001
        return HealthDetail(
            name="litellm",
            status=DependencyStatus.DOWN,
            error=str(exc),
        )


async def _check_api_detail() -> HealthDetail:
    """Check connectivity to the Control Plane API."""
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{_settings.api_url}/api/health/live")
            latency = int((time.monotonic() - t0) * 1000)
            status = DependencyStatus.OK if resp.status_code == 200 else DependencyStatus.DEGRADED
            return HealthDetail(name="api", status=status, latency_ms=latency)
    except Exception as exc:  # noqa: BLE001
        return HealthDetail(
            name="api",
            status=DependencyStatus.DEGRADED,
            error=str(exc),
        )
