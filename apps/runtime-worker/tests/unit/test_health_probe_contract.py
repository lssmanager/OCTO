import asyncio
import os

import pytest
from fastapi import HTTPException

os.environ.setdefault("INTERNAL_SECRET", "runtime-secret-runtime-secret-runtime-1234")
os.environ.setdefault("REDIS_URL", "redis://redis:6379")
os.environ.setdefault("LITELLM_API_KEY", "litellm-key-litellm-key")
os.environ.setdefault("RUNTIME_DATABASE_URL", "postgresql://runtime:pass@db:5432/octo")

from src.routers import health  # noqa: E402


SENSITIVE_PUBLIC_KEYS = (
    "redis",
    "database",
    "postgres",
    "queue",
    "litellm",
    "control_plane",
    "checks",
    "detail",
    "error",
    "latency",
    "commit",
    "version",
    "heartbeat",
    "workerId",
    "metadata",
)


def test_public_runtime_health_root_is_probe_safe() -> None:
    body = asyncio.run(health.health_check())
    data = body.model_dump()

    assert sorted(data.keys()) == ["status", "timestamp"]
    assert data["status"] == "ok"
    assert not any(key in str(data) for key in SENSITIVE_PUBLIC_KEYS)


def test_public_runtime_readiness_omits_dependency_details(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_checks() -> dict[str, health.DependencyCheck]:
        return {
            "redis": health.DependencyCheck(status="ok", latency_ms=1.2),
            "database": health.DependencyCheck(status="error", detail="connection refused"),
            "litellm": health.DependencyCheck(status="ok", detail="litellm metadata"),
        }

    monkeypatch.setattr(health, "_run_all_checks", fake_checks)

    response = asyncio.run(health.readiness())

    assert response.status_code == 503
    assert response.body is not None
    text = response.body.decode("utf-8")
    assert '"status":"not_ready"' in text
    assert '"ready":false' in text
    assert not any(key in text for key in SENSITIVE_PUBLIC_KEYS)


def test_runtime_operational_status_requires_internal_secret() -> None:
    with pytest.raises(HTTPException) as excinfo:
        asyncio.run(health.runtime_status(None))

    assert excinfo.value.status_code == 401
