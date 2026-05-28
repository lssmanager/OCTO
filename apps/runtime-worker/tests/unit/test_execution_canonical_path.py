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
    ) -> dict[str, Any]:
        calls["execution_id"] = execution_id
        calls["tenant_id"] = tenant_id
        calls["trace_id"] = trace_id or ""
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
    }


async def test_execution_service_returns_failed_result_on_runtime_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_run_f1_execution(
        *,
        execution_id: str,
        tenant_id: str,
        trace_id: str | None = None,
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
    )

    service = ExecutionService()
    result = await service.run(request)

    assert result.status.value == "failed"
    assert result.output is None
    assert "runtime unavailable" in (result.error or "")
