from pathlib import Path
import sys

import pytest

from app.mcp.descriptor_mapper import MCPDescriptorMapper
from app.mcp.models import MCPServerDefinition, MCPServerStatus, MCPToolDescriptor
from app.mcp.tool_bridge import MCPToolBridge
from app.tools.runtime_context import ToolInvocationStatus, ToolRuntimeContext

FAKE = str(Path(__file__).with_name("fake_mcp_server.py").resolve())
SERVERS = {"srv": MCPServerDefinition(server_id="srv", slug="fake", command=sys.executable, args=[FAKE], status=MCPServerStatus.APPROVED, env_allowlist=["MCP_FAKE_SCENARIO"])}


def load_server(sid: str): return SERVERS[sid]


def _ctx(**kwargs):
    data = dict(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="i2", idempotency_key="k2")
    data.update(kwargs)
    return ToolRuntimeContext(**data)


def _tool():
    descriptor = MCPToolDescriptor(
        server_id="srv",
        server_slug="fake",
        remote_name="search_docs",
        canonical_name="mcp.fake.search_docs",
        description="ok",
        input_schema={"type":"object","properties":{"q":{"type":"string"}},"required":["q"]},
        output_schema={"type":"object"},
        descriptor_hash="pending",
    )
    tool = MCPDescriptorMapper().to_tool_definition(SERVERS["srv"], descriptor)
    from app.tools.descriptor_hash import compute_descriptor_hash
    tool.descriptor_hash = compute_descriptor_hash(tool)
    return tool


@pytest.mark.asyncio
async def test_bridge_success() -> None:
    b = MCPToolBridge(load_server)
    res = await b.execute_mcp_stdio_tool(_tool(), {"q":"x"}, _ctx())
    assert res.status == ToolInvocationStatus.SUCCEEDED


@pytest.mark.asyncio
async def test_bridge_rejects_oversized_output(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCP_FAKE_SCENARIO", "huge_output")
    res = await MCPToolBridge(load_server).execute_mcp_stdio_tool(_tool(), {"q":"x"}, _ctx(stdout_limit_bytes=512))
    assert res.status == ToolInvocationStatus.FAILED
    assert res.error_code == "MCP_PROTOCOL_ERROR"


@pytest.mark.asyncio
async def test_bridge_separates_protocol_and_tool_errors(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("MCP_FAKE_SCENARIO", "invalid_tools_list")
    protocol = await MCPToolBridge(load_server).execute_mcp_stdio_tool(_tool(), {"q":"x"}, _ctx())
    assert protocol.error_code == "MCP_PROTOCOL_ERROR"

    monkeypatch.setenv("MCP_FAKE_SCENARIO", "tool_error")
    tool_error = await MCPToolBridge(load_server).execute_mcp_stdio_tool(_tool(), {"q":"x"}, _ctx())
    assert tool_error.error_code == "MCP_TOOL_FAILED"
