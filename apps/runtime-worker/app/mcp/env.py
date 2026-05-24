from __future__ import annotations
import os
from app.mcp.models import MCPServerDefinition

def build_mcp_env(server: MCPServerDefinition, tenant_id: str, execution_id: str, agent_id: str, trace_id: str) -> dict[str, str]:
    env = {
        "OCTO_TENANT_ID": tenant_id,
        "OCTO_EXECUTION_ID": execution_id,
        "OCTO_AGENT_ID": agent_id,
        "OCTO_TRACE_ID": trace_id,
        "OCTO_MCP_SERVER_ID": server.server_id,
    }
    for key in server.env_allowlist:
        if key in os.environ:
            env[key] = os.environ[key]
    return env
