from __future__ import annotations
from app.mcp.descriptor_verifier import MCPDescriptorVerifier
from app.mcp.jsonrpc_client import MCPJsonRpcClient
from app.mcp.process_manager import MCPProcessManager
from app.tools.runtime_context import ToolExecutionResult, ToolInvocationStatus

class MCPToolBridge:
    def __init__(self, server_loader, process_manager: MCPProcessManager | None = None, verifier: MCPDescriptorVerifier | None = None) -> None:
        self.server_loader = server_loader
        self.pm = process_manager or MCPProcessManager()
        self.verifier = verifier or MCPDescriptorVerifier()

    async def execute_mcp_stdio_tool(self, tool_def, args: dict, context) -> ToolExecutionResult:
        server = self.server_loader(tool_def.source_ref)
        proc = await self.pm.spawn(server, context)
        client = MCPJsonRpcClient(proc, timeout_ms=tool_def.timeout_ms)
        try:
            await client.initialize()
            tools = await client.tools_list()
            self.verifier.verify_before_call(server, tool_def, tools)
            remote_name = tool_def.name.split('.', 2)[-1]
            result = await client.tools_call(remote_name, args)
            return ToolExecutionResult(status=ToolInvocationStatus.SUCCEEDED, result_json=result, output_schema_valid=True)
        finally:
            await client.close()
