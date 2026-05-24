import asyncio, os, sys, pytest
from app.mcp.jsonrpc_client import MCPJsonRpcClient
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
