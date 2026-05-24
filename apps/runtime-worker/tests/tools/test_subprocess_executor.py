import pytest

from app.tools.builtin.json_transform import json_transform_definition
from app.tools.runtime_context import ToolRuntimeContext, ToolInvocationStatus
from app.tools.subprocess_executor import BuiltinSubprocessExecutor


@pytest.mark.asyncio
async def test_subprocess_executor_success() -> None:
    ctx = ToolRuntimeContext(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="inv1", idempotency_key="k1")
    res = await BuiltinSubprocessExecutor().execute_builtin_tool(json_transform_definition(), {"input": {"a": 1}, "expression": "get:a"}, ctx)
    assert res.status == ToolInvocationStatus.SUCCEEDED
    assert res.result_json == {"result": 1}
