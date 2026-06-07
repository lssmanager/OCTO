from __future__ import annotations
from app.mcp.errors import MCPDescriptorChangedError, MCPToolNotFoundError
from app.mcp.models import MCPServerDefinition
from app.tools.descriptor_hash import compute_descriptor_hash

class MCPDescriptorVerifier:
    def verify_before_call(self, server: MCPServerDefinition, tool_def, current_tools_list: list[dict]) -> None:
        remote_name = tool_def.name.split('.', 2)[-1]
        found = next((t for t in current_tools_list if t.get('name') == remote_name), None)
        if not found:
            raise MCPToolNotFoundError(remote_name)
        probe = tool_def.model_copy(deep=True)
        probe.input_schema = found.get("inputSchema") or found.get("input_schema") or probe.input_schema
        probe.output_schema = found.get("outputSchema") or found.get("output_schema") or probe.output_schema
        probe.description = found.get("description", probe.description)
        h = compute_descriptor_hash(probe)
        if h != tool_def.descriptor_hash:
            raise MCPDescriptorChangedError(tool_def.name)
