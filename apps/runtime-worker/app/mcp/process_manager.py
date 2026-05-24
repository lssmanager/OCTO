from __future__ import annotations
import asyncio
from dataclasses import dataclass
from app.mcp.env import build_mcp_env
from app.mcp.errors import MCPServerDisabledError, MCPServerNotApprovedError
from app.mcp.models import MCPServerDefinition, MCPServerStatus
from app.mcp.workdir import create_mcp_workdir

@dataclass
class MCPProcess:
    proc: asyncio.subprocess.Process

class MCPProcessManager:
    def __init__(self, workdir_root: str = "/tmp/octo-mcp") -> None:
        self.workdir_root = workdir_root

    async def spawn(self, server: MCPServerDefinition, context) -> MCPProcess:
        if server.status in {MCPServerStatus.DISABLED, MCPServerStatus.REVOKED}:
            raise MCPServerDisabledError(server.server_id)
        if server.status not in {MCPServerStatus.APPROVED, MCPServerStatus.ENABLED}:
            raise MCPServerNotApprovedError(server.server_id)
        cwd = create_mcp_workdir(self.workdir_root, context.tenant_id, server.server_id)
        env = build_mcp_env(server, context.tenant_id, context.execution_id, context.agent_id, context.trace_id)
        proc = await asyncio.create_subprocess_exec(server.command, *server.args, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, cwd=cwd, env=env)
        return MCPProcess(proc=proc)
