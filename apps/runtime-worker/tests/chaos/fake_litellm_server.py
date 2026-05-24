from __future__ import annotations

import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

app = FastAPI()

state = {"calls": 0, "scenario": "success"}

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    state["calls"] += 1
    scenario = request.headers.get("x-octo-test-scenario") or state["scenario"]
    if scenario == "timeout":
        await asyncio.sleep(10)
        return JSONResponse({"unreachable": True})
    if scenario == "rate_limit":
        return JSONResponse({"error": {"message": "rate limit", "type": "rate_limit_error"}}, status_code=429)
    if scenario == "malformed_json":
        return Response("{bad json", media_type="application/json", status_code=200)
    return JSONResponse({"id": "chatcmpl_test", "object": "chat.completion", "model": "openai/gpt-4.1-mini", "choices": [{"index": 0, "message": {"role": "assistant", "content": "ok"}, "finish_reason": "stop"}], "usage": {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15}})
