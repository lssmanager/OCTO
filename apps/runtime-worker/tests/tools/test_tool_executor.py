import pytest

from app.tools import build_default_tool_registry
from app.tools.async_coordinator import AsyncToolCoordinator
from app.tools.audit import ToolAuditService
from app.tools.executor import ToolExecutor
from app.tools.invocation_repository import ToolInvocationRepository
from app.tools.models import AgentPolicy, AgentToolPolicy
from app.tools.runtime_context import ToolExecutionRequest, ToolExecutionResult, ToolInvocationStatus, ToolRuntimeContext
from app.tools.schema_validator import SchemaValidator
from app.tools.subprocess_executor import BuiltinSubprocessExecutor
from app.tools.policy_engine import PolicyEngine


class Dummy:
    def __init__(self) -> None:
        self.items = []

    async def append_write(self, item):
        self.items.append(item)

    async def publish(self, event):
        self.items.append(event)


@pytest.mark.asyncio
async def test_tool_executor_flow() -> None:
    registry = build_default_tool_registry()
    repo = ToolInvocationRepository()
    cp = Dummy()
    out = Dummy()
    ex = ToolExecutor(registry, PolicyEngine(), SchemaValidator(), BuiltinSubprocessExecutor(), AsyncToolCoordinator(repo, cp, out), repo, ToolAuditService(), cp, out, None, None)
    ctx = ToolRuntimeContext(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="inv2", idempotency_key="k2")
    req = ToolExecutionRequest(tool_name="json_transform", arguments_json={"input": {"x": 2}, "expression": "get:x"})
    pol = AgentPolicy(tool_policy=AgentToolPolicy(allow=["json_transform"]))
    res = await ex.execute(req, ctx, pol, ["json_transform"])
    assert res.status == ToolInvocationStatus.SUCCEEDED

    bad = await ex.execute(ToolExecutionRequest(tool_name="missing", arguments_json={}), ctx.model_copy(update={"tool_invocation_id":"inv3","idempotency_key":"k3"}), pol, ["json_transform"])
    assert bad.error_code == "TOOL_NOT_ALLOWED"


class BadOutputExecutor:
    async def execute_builtin_tool(self, tool_def, args, context):
        return ToolExecutionResult(status=ToolInvocationStatus.SUCCEEDED, result_json={"invalid": True})


@pytest.mark.asyncio
async def test_invalid_output_not_checkpointed() -> None:
    registry = build_default_tool_registry()
    repo = ToolInvocationRepository()
    cp = Dummy()
    out = Dummy()
    ex = ToolExecutor(registry, PolicyEngine(), SchemaValidator(), BadOutputExecutor(), AsyncToolCoordinator(repo, cp, out), repo, ToolAuditService(), cp, out, None, None)
    ctx = ToolRuntimeContext(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="inv4", idempotency_key="k4")
    req = ToolExecutionRequest(tool_name="json_transform", arguments_json={"input": {"x": 2}, "expression": "get:x"})
    pol = AgentPolicy(tool_policy=AgentToolPolicy(allow=["json_transform"]))
    res = await ex.execute(req, ctx, pol, ["json_transform"])
    assert res.error_code == "TOOL_OUTPUT_INVALID"
    assert cp.items == []
