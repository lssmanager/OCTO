import pytest
from app.mcp.models import MCPServerDefinition, MCPServerStatus
from app.mcp.tool_bridge import MCPToolBridge
from app.tools.models import ToolDefinition, ToolKind
from app.tools.runtime_context import ToolRuntimeContext, ToolInvocationStatus

SERVERS = {"srv": MCPServerDefinition(server_id="srv", slug="fake", command="python", args=["apps/runtime-worker/tests/mcp/fake_mcp_server.py"], status=MCPServerStatus.APPROVED)}

def load_server(sid: str): return SERVERS[sid]

@pytest.mark.asyncio
async def test_bridge_success() -> None:
    b = MCPToolBridge(load_server)
    tool = ToolDefinition(name="mcp.fake.search_docs", kind=ToolKind.MCP_STDIO, description="d", input_schema={"type":"object"}, output_schema={"type":"object"}, source="mcp", source_ref="srv", descriptor_hash=None)
    ctx = ToolRuntimeContext(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="i2", idempotency_key="k2")
    res = await b.execute_mcp_stdio_tool(tool, {"q":"x"}, ctx)
    assert res.status == ToolInvocationStatus.SUCCEEDED
