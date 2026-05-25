import asyncio, os, sys, pytest
from app.mcp.jsonrpc_client import MCPJsonRpcClient
from app.mcp.errors import MCPProtocolError
from app.mcp.process_manager import MCPProcess

@pytest.mark.asyncio
async def test_jsonrpc_initialize_and_list() -> None:
    env = dict(os.environ); env["MCP_FAKE_SCENARIO"] = "normal"
    p = await asyncio.create_subprocess_exec(sys.executable, "apps/runtime-worker/tests/mcp/fake_mcp_server.py", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env)
    c = MCPJsonRpcClient(MCPProcess(p), timeout_ms=1000)
    assert "serverInfo" in await c.initialize()
    tools = await c.tools_list()
    assert tools[0]["name"] == "search_docs"
    await c.close()

@pytest.mark.asyncio
async def test_jsonrpc_rejects_oversized_output() -> None:
    env = dict(os.environ); env["MCP_FAKE_SCENARIO"] = "oversized"
    p = await asyncio.create_subprocess_exec(sys.executable, "apps/runtime-worker/tests/mcp/fake_mcp_server.py", stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env)
    c = MCPJsonRpcClient(MCPProcess(p), timeout_ms=1000, max_line_bytes=1024)
    with pytest.raises(MCPProtocolError, match="response too large"):
        await c.initialize()
    await c.close()
