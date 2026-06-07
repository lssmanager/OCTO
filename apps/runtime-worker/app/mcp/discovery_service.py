from __future__ import annotations

import re

from app.mcp.descriptor_mapper import DEFAULT_OUTPUT
from app.mcp.jsonrpc_client import MCPJsonRpcClient
from app.mcp.models import MCPServerDefinition, MCPServerStatus, MCPToolDescriptor
from app.tools.descriptor_hash import compute_descriptor_hash
from app.tools.models import SideEffectLevel, ToolDefinition, ToolKind, ToolStatus

BAD_PATTERNS = ["ignore previous instructions", "system prompt", "developer message", "secret", "exfiltrate", "do not tell the user", "bypass"]


class MCPDiscoveryService:
    def __init__(self, process_manager) -> None:
        self.process_manager = process_manager

    async def discover_tools(self, server: MCPServerDefinition, context) -> list[MCPToolDescriptor]:
        p = await self.process_manager.spawn(server, context)
        client = MCPJsonRpcClient(p, timeout_ms=server.timeout_ms, response_limit_bytes=context.stdout_limit_bytes)
        try:
            await client.initialize()
            tools = await client.tools_list()
            out = []
            for t in tools:
                remote = re.sub(r"[^a-zA-Z0-9_.-]", "_", t["name"])
                canonical = f"mcp.{server.slug}.{remote}"
                desc = t.get("description", "")
                input_schema = t.get("inputSchema") or t.get("input_schema") or {}
                output_schema = t.get("outputSchema") or t.get("output_schema") or DEFAULT_OUTPUT
                annotations = {"suspicious": any(k in desc.lower() for k in BAD_PATTERNS)}
                tool = ToolDefinition(
                    name=canonical,
                    kind=ToolKind.MCP_STDIO,
                    description=desc or remote,
                    input_schema=input_schema,
                    output_schema=output_schema,
                    timeout_ms=server.timeout_ms,
                    side_effect_level=SideEffectLevel.LOW,
                    requires_approval=True,
                    tenant_scoped=server.tenant_scoped,
                    allowed_roles=server.allowed_roles,
                    allowed_scopes=server.allowed_scopes,
                    sandbox_profile=server.sandbox_profile,
                    network_policy=server.network_policy,
                    egress_allowlist=server.egress_allowlist,
                    source="mcp",
                    source_ref=server.server_id,
                    status=ToolStatus.PENDING_REVIEW,
                    enabled=False,
                    version=server.version,
                )
                dh = compute_descriptor_hash(tool)
                out.append(
                    MCPToolDescriptor(
                        server_id=server.server_id,
                        server_slug=server.slug,
                        remote_name=remote,
                        canonical_name=canonical,
                        description=desc,
                        input_schema=input_schema,
                        output_schema=output_schema,
                        annotations=annotations,
                        descriptor_hash=dh,
                        status=MCPServerStatus.PENDING_REVIEW,
                    )
                )
            return out
        finally:
            await client.close()
