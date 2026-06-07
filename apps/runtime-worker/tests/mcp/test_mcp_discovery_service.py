from pathlib import Path
import sys

import pytest

from app.mcp.descriptor_mapper import MCPDescriptorMapper
from app.mcp.discovery_service import MCPDiscoveryService
from app.mcp.models import MCPServerDefinition, MCPServerStatus, MCPToolDescriptor
from app.mcp.process_manager import MCPProcessManager
from app.tools.descriptor_hash import compute_descriptor_hash
from app.tools.runtime_context import ToolRuntimeContext

FAKE = str(Path(__file__).with_name("fake_mcp_server.py").resolve())


@pytest.mark.asyncio
async def test_discovery_pending_review() -> None:
    s = MCPServerDefinition(server_id="srv1", slug="fake", command=sys.executable, args=[FAKE], status=MCPServerStatus.APPROVED, env_allowlist=["MCP_FAKE_SCENARIO"])
    ctx = ToolRuntimeContext(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="i", idempotency_key="k")
    ds = MCPDiscoveryService(MCPProcessManager())
    items = await ds.discover_tools(s, ctx)
    assert items[0].canonical_name.startswith("mcp.fake.")


def test_discovered_descriptor_hash_covers_server_access_controls() -> None:
    descriptor_kwargs = dict(
        server_id="srv1",
        server_slug="fake",
        remote_name="search_docs",
        canonical_name="mcp.fake.search_docs",
        description="ok",
        input_schema={"type": "object"},
        output_schema={"type": "object"},
    )
    baseline_server = MCPServerDefinition(server_id="srv1", slug="fake", command=sys.executable, args=[FAKE], status=MCPServerStatus.APPROVED, allowed_scopes=["read"])
    changed_server = baseline_server.model_copy(update={"allowed_scopes": ["write"]})
    base_tool = MCPDescriptorMapper().to_tool_definition(baseline_server, MCPToolDescriptor(**descriptor_kwargs, descriptor_hash="x"))
    changed_tool = MCPDescriptorMapper().to_tool_definition(changed_server, MCPToolDescriptor(**descriptor_kwargs, descriptor_hash="x"))
    base_tool.descriptor_hash = None
    changed_tool.descriptor_hash = None
    assert compute_descriptor_hash(base_tool) != compute_descriptor_hash(changed_tool)
