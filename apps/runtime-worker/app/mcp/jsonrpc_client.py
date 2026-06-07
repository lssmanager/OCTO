from __future__ import annotations

import asyncio
import json
from typing import Any

from app.mcp.errors import MCPProtocolError, MCPToolCallError


class MCPJsonRpcClient:
    def __init__(self, process, timeout_ms: int = 30000, response_limit_bytes: int = 64_000) -> None:
        self.process = process
        self.timeout_ms = timeout_ms
        self.response_limit_bytes = max(1, int(response_limit_bytes))
        self._id = 0

    async def _read_limited_line(self) -> bytes:
        remaining = self.response_limit_bytes + 1
        chunks: list[bytes] = []
        while remaining > 0:
            chunk = await self.process.proc.stdout.read(min(4096, remaining))
            if not chunk:
                break
            chunks.append(chunk)
            remaining -= len(chunk)
            if b"\n" in chunk:
                line = b"".join(chunks).split(b"\n", 1)[0] + b"\n"
                if len(line) > self.response_limit_bytes:
                    raise MCPProtocolError("response too large")
                return line
        if remaining <= 0:
            raise MCPProtocolError("response too large")
        raise MCPProtocolError("missing response line")

    def _validate_jsonrpc_response(self, resp: Any, req_id: int) -> dict[str, Any]:
        if not isinstance(resp, dict):
            raise MCPProtocolError("response must be a JSON object")
        if resp.get("jsonrpc") not in {None, "2.0"}:
            raise MCPProtocolError("invalid jsonrpc version")
        if resp.get("id") != req_id:
            raise MCPProtocolError("id mismatch")
        if "error" in resp:
            err = resp["error"]
            if not isinstance(err, dict) or not isinstance(err.get("message"), str):
                raise MCPProtocolError("invalid error payload")
            raise MCPToolCallError(err["message"])
        if "result" not in resp:
            raise MCPProtocolError("missing result")
        result = resp["result"]
        if not isinstance(result, dict):
            raise MCPProtocolError("invalid result payload")
        return result

    async def _request(self, method: str, params: dict) -> dict:
        if not isinstance(params, dict):
            raise MCPProtocolError("request params must be a JSON object")
        self._id += 1
        req_id = self._id
        payload = {"jsonrpc": "2.0", "id": req_id, "method": method, "params": params}
        encoded = (json.dumps(payload, separators=(",", ":")) + "\n").encode()
        self.process.proc.stdin.write(encoded)
        await self.process.proc.stdin.drain()
        try:
            line = await asyncio.wait_for(self._read_limited_line(), timeout=self.timeout_ms / 1000)
        except TimeoutError as exc:
            raise MCPToolCallError("timeout") from exc
        try:
            resp = json.loads(line.decode("utf-8"))
        except Exception as exc:
            raise MCPProtocolError("invalid json") from exc
        return self._validate_jsonrpc_response(resp, req_id)

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
        tools = res.get("tools")
        if not isinstance(tools, list):
            raise MCPProtocolError("tools/list result must contain a tools array")
        out: list[dict] = []
        for item in tools:
            if not isinstance(item, dict):
                raise MCPProtocolError("tool descriptor must be a JSON object")
            if not isinstance(item.get("name"), str) or not item["name"]:
                raise MCPProtocolError("tool descriptor missing name")
            input_schema = item.get("inputSchema", item.get("input_schema", {}))
            output_schema = item.get("outputSchema", item.get("output_schema", None))
            if not isinstance(input_schema, dict):
                raise MCPProtocolError("tool input schema must be a JSON object")
            if output_schema is not None and not isinstance(output_schema, dict):
                raise MCPProtocolError("tool output schema must be a JSON object")
            if "description" in item and not isinstance(item.get("description"), str):
                raise MCPProtocolError("tool description must be a string")
            out.append(item)
        return out

    async def tools_call(self, name: str, arguments: dict) -> dict:
        if not isinstance(name, str) or not name:
            raise MCPProtocolError("tool name must be a non-empty string")
        if not isinstance(arguments, dict):
            raise MCPProtocolError("tool arguments must be a JSON object")
        result = await self._request("tools/call", {"name": name, "arguments": arguments})
        if result.get("isError") is True:
            raise MCPToolCallError("MCP tool returned isError=true")
        return result

    async def close(self) -> None:
        if self.process.proc.returncode is None:
            self.process.proc.terminate()
            try:
                await asyncio.wait_for(self.process.proc.wait(), timeout=2)
            except TimeoutError:
                self.process.proc.kill()
                await self.process.proc.wait()
