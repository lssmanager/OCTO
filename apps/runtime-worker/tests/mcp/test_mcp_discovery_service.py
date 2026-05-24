import pytest
from app.mcp.discovery_service import MCPDiscoveryService
from app.mcp.models import MCPServerDefinition, MCPServerStatus
from app.mcp.process_manager import MCPProcessManager
from app.tools.runtime_context import ToolRuntimeContext

@pytest.mark.asyncio
async def test_discovery_pending_review() -> None:
    s = MCPServerDefinition(server_id="srv1", slug="fake", command="python", args=["apps/runtime-worker/tests/mcp/fake_mcp_server.py"], status=MCPServerStatus.APPROVED)
    ctx = ToolRuntimeContext(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="i", idempotency_key="k")
    ds = MCPDiscoveryService(MCPProcessManager())
    items = await ds.discover_tools(s, ctx)
    assert items[0].canonical_name.startswith("mcp.fake.")
