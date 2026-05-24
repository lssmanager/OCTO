from __future__ import annotations

import asyncio
import json
import sys

from app.tools.builtin.http_request import execute_http_request
from app.tools.builtin.json_transform import execute_json_transform
from app.tools.builtin.wait_for_event import execute_wait_for_event


async def dispatch_builtin(tool_name: str, args: dict) -> dict:
    if tool_name == "json_transform":
        return execute_json_transform(args)
    if tool_name == "http_request":
        return execute_http_request(args)
    if tool_name == "wait_for_event":
        return execute_wait_for_event(args)
    return {"error_code": "TOOL_NOT_ALLOWED", "message": "unknown builtin tool"}


async def main() -> None:
    tool_name = sys.argv[1]
    args = json.loads(sys.stdin.read() or "{}")
    result = await dispatch_builtin(tool_name, args)
    print(json.dumps(result))


if __name__ == "__main__":
    asyncio.run(main())
