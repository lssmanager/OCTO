from __future__ import annotations

import asyncio

import pytest
from starlette.requests import Request

from tests.chaos.fake_litellm_server import chat_completions, state


@pytest.mark.asyncio
async def test_litellm_timeout_records_failure_and_opens_circuit() -> None:
    state["scenario"] = "timeout"
    scope = {"type": "http", "method": "POST", "path": "/v1/chat/completions", "headers": []}
    req = Request(scope)
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(chat_completions(req), timeout=0.05)


@pytest.mark.asyncio
async def test_rate_limit_opens_circuit_and_triggers_fallback() -> None:
    state["scenario"] = "rate_limit"
    scope = {"type": "http", "method": "POST", "path": "/v1/chat/completions", "headers": []}
    req = Request(scope)
    res = await chat_completions(req)
    assert res.status_code == 429


@pytest.mark.asyncio
async def test_malformed_json_maps_to_canonical_error() -> None:
    state["scenario"] = "malformed_json"
    scope = {"type": "http", "method": "POST", "path": "/v1/chat/completions", "headers": []}
    req = Request(scope)
    res = await chat_completions(req)
    assert res.status_code == 200
    assert b"{bad json" in res.body
