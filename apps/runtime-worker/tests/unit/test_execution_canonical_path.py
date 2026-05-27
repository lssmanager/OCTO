from __future__ import annotations

from fastapi.routing import APIRoute

from src.main import app
from src.schemas import ExecutionRequest
from src.services import executor as executor_module
from src.services.executor import ExecutionService


def test_only_canonical_execute_route_is_registered() -> None:
    paths = {r.path for r in app.routes if isinstance(r, APIRoute)}
    assert "/api/v1/execute" in paths
    assert "/api/v1/execution" not in paths
    assert "/execution" not in paths


async def test_execution_service_delegates_to_f1_runtime(monkeypatch) -> None:
    calls: dict[str, str] = {}

    async def fake_run(*, execution_id: str, tenant_id: str, trace_id: str | None = None, mode: str = "normal") -> dict:
        calls["execution_id"] = execution_id
        calls["tenant_id"] = tenant_id
        calls["trace_id"] = trace_id or ""
        calls["mode"] = mode
        return {"status": "succeeded", "output": "ok"}

    monkeypatch.setattr(executor_module, "run_f1_execution", fake_run)

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
        "mode": "normal",
    }
