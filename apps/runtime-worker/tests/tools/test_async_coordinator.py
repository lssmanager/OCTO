import pytest

from app.tools.async_coordinator import AsyncToolCoordinator
from app.tools.builtin.wait_for_event import wait_for_event_definition
from app.tools.invocation_repository import ToolInvocationRepository
from app.tools.runtime_context import ToolInvocationStatus, ToolRuntimeContext


@pytest.mark.asyncio
async def test_async_pending_and_complete() -> None:
    repo = ToolInvocationRepository()
    c = AsyncToolCoordinator(repo)
    ctx = ToolRuntimeContext(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="inv4", idempotency_key="k4")
    p = await c.start_async_invocation(wait_for_event_definition(), {}, ctx)
    assert p.status == ToolInvocationStatus.PENDING_ASYNC
    done = await c.complete_async_invocation("t", "inv4", {"event_received": True, "payload": {}}, "k4")
    assert done.status == ToolInvocationStatus.SUCCEEDED
