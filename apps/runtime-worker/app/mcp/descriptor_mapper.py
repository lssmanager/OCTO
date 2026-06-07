from __future__ import annotations
from app.mcp.models import MCPServerDefinition, MCPToolDescriptor
from app.tools.models import ToolDefinition, ToolKind, ToolStatus, SideEffectLevel

DEFAULT_OUTPUT = {"type":"object","properties":{"content":{},"isError":{"type":"boolean"}},"additionalProperties":True}

class MCPDescriptorMapper:
    def to_tool_definition(self, server: MCPServerDefinition, descriptor: MCPToolDescriptor) -> ToolDefinition:
        return ToolDefinition(
            name=descriptor.canonical_name,
            kind=ToolKind.MCP_STDIO,
            description=descriptor.description or descriptor.remote_name,
            input_schema=descriptor.input_schema,
            output_schema=descriptor.output_schema or DEFAULT_OUTPUT,
            timeout_ms=server.timeout_ms,
            retryable=False,
            side_effect_level=SideEffectLevel(descriptor.side_effect_level),
            requires_approval=descriptor.requires_approval,
            tenant_scoped=server.tenant_scoped,
            allowed_roles=server.allowed_roles,
            allowed_scopes=server.allowed_scopes,
            sandbox_profile=server.sandbox_profile,
            network_policy=server.network_policy,
            egress_allowlist=server.egress_allowlist,
            source="mcp",
            source_ref=server.server_id,
            descriptor_hash=descriptor.descriptor_hash,
            version=server.version,
            status=ToolStatus.PENDING_REVIEW,
            enabled=False,
        )
