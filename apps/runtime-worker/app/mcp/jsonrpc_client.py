from __future__ import annotations

import asyncio
import json

from app.mcp.errors import MCPProtocolError, MCPToolCallError


class MCPJsonRpcClient:
    def __init__(self, process, timeout_ms: int = 30000, response_limit_bytes: int = 64_000) -> None:
        self.process = process
        self.timeout_ms = timeout_ms
        self.response_limit_bytes = max(1, int(response_limit_bytes))
        self._id = 0

    async def _request(self, method: str, params: dict) -> dict:
        self._id += 1
        req_id = self._id
        payload = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
        self.process.proc.stdin.write((json.dumps(payload) + "\n").encode())
        await self.process.proc.stdin.drain()
        try:
            line = await asyncio.wait_for(
                self.process.proc.stdout.readline(),
                timeout=self.timeout_ms / 1000,
            )
        except asyncio.TimeoutError as exc:
            raise MCPToolCallError("timeout") from exc
        if len(line) > self.response_limit_bytes:
            raise MCPProtocolError("response too large")
        try:
            resp = json.loads(line.decode())
        except Exception as exc:
            raise MCPProtocolError("invalid json") from exc
        if resp.get("id") != req_id:
            raise MCPProtocolError("id mismatch")
        if "error" in resp:
            raise MCPToolCallError(str(resp["error"]))
        if "result" not in resp:
            raise MCPProtocolError("missing result")
        result = resp["result"]
        if not isinstance(result, dict):
            raise MCPProtocolError("invalid result payload")
        return result

    async def initialize(self) -> dict:
        return await self._request(
            "initialize",
            {
                "protocolVersion": "2024-11-05",
                "capabilities": {"tools": {}},
                "clientInfo": {"name": "octo-runtime-worker", "version": "f1"},
            },
        )

    async def tools_list(self) -> list[dict]:
        res = await self._request("tools/list", {})
        return list(res.get("tools", []))

    async def tools_call(self, name: str, arguments: dict) -> dict:
        return await self._request("tools/call", {"name": name, "arguments": arguments})

    async def close(self) -> None:
        if self.process.proc.returncode is None:
            self.process.proc.terminate()
            await self.process.proc.wait()
