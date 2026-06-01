from __future__ import annotations

from typing import Any

import pytest
from fastapi.routing import APIRoute

from src.main import app
from src.schemas import ExecutionRequest
from src.services import executor as executor_module
from src.services.executor import ExecutionService


def test_only_canonical_execute_submit_route_is_registered() -> None:
    post_paths = {
        route.path
        for route in app.routes
        if isinstance(route, APIRoute) and "POST" in route.methods
    }

    assert "/api/v1/execute" in post_paths

    assert "/api/v1/execution" not in post_paths
    assert "/execution" not in post_paths
    assert "/api/v1/execute/internal" not in post_paths


def test_no_legacy_execution_route_is_registered() -> None:
    paths = {
        route.path
        for route in app.routes
        if isinstance(route, APIRoute)
    }

    assert all("/execution" not in path for path in paths)
    assert all("execute/internal" not in path for path in paths)


async def test_execution_service_delegates_to_f1_runtime(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: dict[str, str] = {}

    async def fake_run_f1_execution(
        *,
        execution_id: str,
        tenant_id: str,
        trace_id: str | None = None,
        mode: str = "normal",
        lease_token: str | None = None,
        attempt: int | None = None,
        lease_owner: str | None = None,
    ) -> dict[str, Any]:
        calls["execution_id"] = execution_id
        calls["tenant_id"] = tenant_id
        calls["trace_id"] = trace_id or ""
        calls["lease_token"] = lease_token or ""
        calls["lease_owner"] = lease_owner or ""
        calls["attempt"] = str(attempt)
        return {
            "status": "succeeded",
            "output": "ok",
            "usage": {"total_tokens": 0},
            "tool_calls": [],
        }

    monkeypatch.setattr(
        executor_module,
        "run_f1_execution",
        fake_run_f1_execution,
    )

    request = ExecutionRequest(
        execution_id="exec-1",
        tenant_id="tenant-1",
        agent_id="agent-1",
        workspace_id="ws-1",
        task="do work",
        llm={"primary": "litellm/default"},
        trace_id="trace-1",
        run_id="1",
        lease_owner="scheduler-test",
        lease_token="lease-test",
        attempt=1,
    )

    service = ExecutionService()
    result = await service.run(request)

    assert result.execution_id == "exec-1"
    assert result.status.value == "completed"
    assert result.output == "ok"
    assert calls == {
        "execution_id": "exec-1",
        "tenant_id": "tenant-1",
        "trace_id": "trace-1",
        "lease_token": "lease-test",
        "lease_owner": "scheduler-test",
        "attempt": "1",
    }


async def test_execution_service_returns_failed_result_on_runtime_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_run_f1_execution(
        *,
        execution_id: str,
        tenant_id: str,
        trace_id: str | None = None,
        mode: str = "normal",
        lease_token: str | None = None,
        attempt: int | None = None,
        lease_owner: str | None = None,
    ) -> dict[str, Any]:
        raise RuntimeError("runtime unavailable")

    monkeypatch.setattr(
        executor_module,
        "run_f1_execution",
        fake_run_f1_execution,
    )

    request = ExecutionRequest(
        execution_id="exec-1",
        tenant_id="tenant-1",
        agent_id="agent-1",
        workspace_id="ws-1",
        task="do work",
        llm={"primary": "litellm/default"},
        trace_id="trace-1",
        run_id="1",
        lease_owner="scheduler-test",
        lease_token="lease-test",
        attempt=1,
    )

    service = ExecutionService()
    result = await service.run(request)

    assert result.status.value == "failed"
    assert result.output is None
    assert "runtime unavailable" in (result.error or "")


async def test_execute_endpoint_returns_202_before_runtime_finishes(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import asyncio
    import time

    import httpx

    from src.routers import execute as execute_router
    from src.schemas import ExecutionResult, ExecutionStatus

    started = asyncio.Event()
    release = asyncio.Event()

    class SlowExecutor:
        async def run(self, request: ExecutionRequest) -> ExecutionResult:
            started.set()
            await release.wait()
            return ExecutionResult(
                execution_id=request.execution_id,
                status=ExecutionStatus.COMPLETED,
                output="ok",
                usage={},
                duration_ms=1,
            )

    monkeypatch.setattr(execute_router, "_executor", SlowExecutor())

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        before = time.monotonic()
        response = await client.post(
            "/api/v1/execute",
            headers={"x-internal-secret": "0123456789abcdef0123456789abcdef"},
            json={
                "executionId": "exec-async-1",
                "tenantId": "tenant-1",
                "agentId": "agent-1",
                "workspaceId": "ws-1",
                "task": "do async work",
                "traceId": "trace-1",
                "runId": "exec-async-1",
                "leaseOwner": "scheduler-test",
                "leaseToken": "lease-test",
                "attempt": 1,
            },
        )
        elapsed_ms = (time.monotonic() - before) * 1000

    try:
        assert response.status_code == 202
        assert response.json() == {
            "executionId": "exec-async-1",
            "status": "accepted",
            "mode": "normal",
        }
        assert elapsed_ms < 200
        assert started.is_set()
    finally:
        release.set()
        await asyncio.sleep(0)
