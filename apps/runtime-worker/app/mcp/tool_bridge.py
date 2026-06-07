from __future__ import annotations

import json

from app.mcp.descriptor_verifier import MCPDescriptorVerifier
from app.mcp.errors import MCPProtocolError, MCPToolCallError
from app.mcp.jsonrpc_client import MCPJsonRpcClient
from app.mcp.process_manager import MCPProcessManager
from app.tools.runtime_context import ToolExecutionResult, ToolInvocationStatus


def _result_size_bytes(result: dict) -> int:
    return len(json.dumps(result, sort_keys=True, separators=(",", ":"), default=str).encode("utf-8"))


class MCPToolBridge:
    def __init__(self, server_loader, process_manager: MCPProcessManager | None = None, verifier: MCPDescriptorVerifier | None = None) -> None:
        self.server_loader = server_loader
        self.pm = process_manager or MCPProcessManager()
        self.verifier = verifier or MCPDescriptorVerifier()

    async def execute_mcp_stdio_tool(self, tool_def, args: dict, context) -> ToolExecutionResult:
        if not isinstance(args, dict):
            return ToolExecutionResult(
                status=ToolInvocationStatus.FAILED,
                error_code="MCP_ARGUMENTS_INVALID",
                error_message="MCP tool arguments must be a JSON object.",
                retryable=False,
            )
        server = self.server_loader(tool_def.source_ref)
        proc = await self.pm.spawn(server, context)
        client = MCPJsonRpcClient(
            proc,
            timeout_ms=min(tool_def.timeout_ms, server.timeout_ms),
            response_limit_bytes=context.stdout_limit_bytes,
        )
        try:
            await client.initialize()
            tools = await client.tools_list()
            self.verifier.verify_before_call(server, tool_def, tools)
            remote_name = tool_def.name.split('.', 2)[-1]
            result = await client.tools_call(remote_name, args)
            if not isinstance(result, dict):
                return ToolExecutionResult(
                    status=ToolInvocationStatus.FAILED,
                    error_code="MCP_OUTPUT_INVALID",
                    error_message="MCP tool output must be a JSON object.",
                    retryable=False,
                )
            if _result_size_bytes(result) > context.stdout_limit_bytes:
                return ToolExecutionResult(
                    status=ToolInvocationStatus.FAILED,
                    error_code="MCP_OUTPUT_TOO_LARGE",
                    error_message="MCP tool output exceeded the configured limit.",
                    retryable=False,
                )
            return ToolExecutionResult(
                status=ToolInvocationStatus.SUCCEEDED,
                result_json=result,
                output_schema_valid=True,
            )
        except MCPToolCallError as exc:
            return ToolExecutionResult(
                status=ToolInvocationStatus.FAILED,
                error_code="MCP_TOOL_FAILED",
                error_message=str(exc),
                retryable=False,
            )
        except MCPProtocolError as exc:
            return ToolExecutionResult(
                status=ToolInvocationStatus.FAILED,
                error_code="MCP_PROTOCOL_ERROR",
                error_message=str(exc),
                retryable=False,
            )
        finally:
            await client.close()
