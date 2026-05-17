"""Health router — liveness, readiness y status probes.

Endpoints:
  GET /health       — full status con phase: F0 (criterio de aceptación)
  GET /health/live  — liveness probe (proceso vivo?)
  GET /health/ready — readiness probe (deps alcanzables?)
  GET /health/version — versión y uptime

Criterio de aceptación:
  GET /health retorna {status, service, version, phase: F0}
"""
from __future__ import annotations

import time
from datetime import UTC, datetime

import httpx
import redis.asyncio as aioredis
import structlog
from fastapi import APIRouter

from ..config import get_settings
from ..schemas.health import DependencyStatus, HealthDetail, HealthResponse

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/health", tags=["health"])
_settings = get_settings()

_START_TIME = time.monotonic()
_VERSION = _settings.otel_service_version
_PHASE = _settings.build_phase


@router.get(
    "",
    response_model=HealthResponse,
    summary="Full health status",
    description="Retorna {status, service, version, phase: F0} + dependency checks.",
)
async def health_status() -> HealthResponse:
    """Criterio de aceptación: {status: ok, service: runtime-worker, version: ..., phase: F0}."""
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
        service=_settings.otel_service_name,
        version=_VERSION,
        phase=_PHASE,
        checks=[redis_check, litellm_check, api_check],
    )


@router.get("/live", summary="Liveness probe")
async def liveness() -> dict[str, str]:
    """200 si el proceso está vivo. Sin checks de deps."""
    return {"status": "ok"}


@router.get("/ready", summary="Readiness probe")
async def readiness() -> dict[str, str | bool]:
    """200 solo si todas las deps críticas están alcanzables."""
    redis_ok = await _check_redis()
    litellm_ok = await _check_litellm()

    if redis_ok and litellm_ok:
        return {"status": "ready", "ready": True}

    return {
        "status": "not_ready",
        "ready": False,
        "redis": redis_ok,
        "litellm": litellm_ok,
    }


@router.get("/version", summary="Service version")
async def version_info() -> dict[str, str | float]:
    """Versión, uptime y build info."""
    return {
        "service": _settings.otel_service_name,
        "version": _VERSION,
        "phase": _PHASE,
        "build_version": _settings.build_version,
        "build_commit": _settings.build_commit,
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
        return HealthDetail(
            name="redis",
            status=DependencyStatus.OK,
            latency_ms=int((time.monotonic() - t0) * 1000),
        )
    except Exception as exc:  # noqa: BLE001
        return HealthDetail(name="redis", status=DependencyStatus.DOWN, error=str(exc))


async def _check_litellm_detail() -> HealthDetail:
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{_settings.litellm_url}/health")
            latency = int((time.monotonic() - t0) * 1000)
            s = DependencyStatus.OK if resp.status_code < 500 else DependencyStatus.DEGRADED
            return HealthDetail(name="litellm", status=s, latency_ms=latency)
    except Exception as exc:  # noqa: BLE001
        return HealthDetail(name="litellm", status=DependencyStatus.DOWN, error=str(exc))


async def _check_api_detail() -> HealthDetail:
    """Check de conectividad al Control Plane API."""
    t0 = time.monotonic()
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            resp = await client.get(f"{_settings.api_url}/health/live")
            latency = int((time.monotonic() - t0) * 1000)
            s = DependencyStatus.OK if resp.status_code == 200 else DependencyStatus.DEGRADED
            return HealthDetail(name="api", status=s, latency_ms=latency)
    except Exception as exc:  # noqa: BLE001
        return HealthDetail(name="api", status=DependencyStatus.DEGRADED, error=str(exc))
