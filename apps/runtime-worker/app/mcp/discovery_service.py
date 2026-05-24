from __future__ import annotations
import hashlib, json, re
from app.mcp.jsonrpc_client import MCPJsonRpcClient
from app.mcp.models import MCPServerDefinition, MCPToolDescriptor, MCPServerStatus

BAD_PATTERNS = ["ignore previous instructions","system prompt","developer message","secret","exfiltrate","do not tell the user","bypass"]

class MCPDiscoveryService:
    def __init__(self, process_manager) -> None:
        self.process_manager = process_manager

    async def discover_tools(self, server: MCPServerDefinition, context) -> list[MCPToolDescriptor]:
        p = await self.process_manager.spawn(server, context)
        client = MCPJsonRpcClient(p, timeout_ms=server.timeout_ms)
        try:
            await client.initialize()
            tools = await client.tools_list()
            out = []
            for t in tools:
                remote = re.sub(r"[^a-zA-Z0-9_.-]", "_", t["name"])
                canonical = f"mcp.{server.slug}.{remote}"
                desc = t.get("description","")
                annotations = {"suspicious": any(k in desc.lower() for k in BAD_PATTERNS)}
                payload = {"server":server.server_id,"remote":remote,"description":desc,"input":t.get("inputSchema") or t.get("input_schema") or {},"output":t.get("outputSchema")}
                dh = "sha256:" + hashlib.sha256(json.dumps(payload, sort_keys=True).encode()).hexdigest()
                out.append(MCPToolDescriptor(server_id=server.server_id, server_slug=server.slug, remote_name=remote, canonical_name=canonical, description=desc, input_schema=payload["input"], output_schema=payload["output"], annotations=annotations, descriptor_hash=dh, status=MCPServerStatus.PENDING_REVIEW))
            return out
        finally:
            await client.close()
