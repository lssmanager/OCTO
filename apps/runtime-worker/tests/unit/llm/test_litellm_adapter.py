from __future__ import annotations

from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.adapters.llm.base import LLMCanonicalError
from app.adapters.llm.litellm_adapter import LiteLLMAdapter
from app.contracts.llm import CanonicalChatMessage, CanonicalToolDefinition, ChatCompletionRequest, PromptCachePolicy


class DummyClient:
    def __init__(self, response: object) -> None:
        self.response = response
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    async def create(self, **_: object) -> object:
        return self.response


def _raw_response(content: str = "hello", finish_reason: str = "stop", with_tool: bool = False) -> object:
    tool_calls = [SimpleNamespace(id="tc_1", function=SimpleNamespace(name="sum", arguments='{"a":1}'))] if with_tool else None
    message = SimpleNamespace(content=content, tool_calls=tool_calls)
    choice = SimpleNamespace(message=message, finish_reason=finish_reason)
    usage = SimpleNamespace(prompt_tokens=11, completion_tokens=7, total_tokens=18, model_dump=lambda: {"completion_tokens_details": {"reasoning_tokens": 2}, "prompt_tokens_details": {"cached_tokens": 3}})
    return SimpleNamespace(id="resp_1", model="openai/gpt-4.1-mini", choices=[choice], usage=usage, _hidden_params={"response_cost": "0.00012"}, model_dump=lambda: {"id": "resp_1"})


def _req(**kwargs: object) -> ChatCompletionRequest:
    base = dict(
        tenant_id="t1",
        execution_id="e1",
        agent_id="a1",
        model="openai/gpt-4.1-mini",
        messages=[CanonicalChatMessage(role="user", content="hola")],
    )
    base.update(kwargs)
    return ChatCompletionRequest(**base)


def test_build_payload_with_tools_and_metadata() -> None:
    adapter = object.__new__(LiteLLMAdapter)
    req = _req(tools=[CanonicalToolDefinition(name="sum", description="s", input_schema={"type": "object"})], metadata={"trace_id": "tr1"})
    payload = adapter._build_payload(req)
    assert payload["metadata"]["trace_id"] == "tr1"
    assert payload["tools"][0]["type"] == "function"


def test_tool_choice_none_drops_tools() -> None:
    adapter = object.__new__(LiteLLMAdapter)
    req = _req(tool_choice="none", tools=[CanonicalToolDefinition(name="sum", description="s", input_schema={})])
    payload = adapter._build_payload(req)
    assert "tools" not in payload


def test_tool_choice_required_without_tools_fails() -> None:
    adapter = object.__new__(LiteLLMAdapter)
    with pytest.raises(LLMCanonicalError):
        adapter._build_payload(_req(tool_choice="required"))


@pytest.mark.asyncio
async def test_normal_chat_response() -> None:
    adapter = object.__new__(LiteLLMAdapter)
    adapter.metrics = None
    adapter.logger = None
    adapter.client = DummyClient(_raw_response())
    adapter.circuit_registry = None
    adapter.rate_limiter = None
    res = await adapter.chat(_req())
    assert res.finish_reason == "stop"
    assert res.usage.estimated_cost_usd == Decimal("0.00012")


@pytest.mark.asyncio
async def test_tool_calls_normalization() -> None:
    adapter = object.__new__(LiteLLMAdapter)
    adapter.metrics = None
    adapter.logger = None
    adapter.client = DummyClient(_raw_response(content="", finish_reason="tool_calls", with_tool=True))
    adapter.circuit_registry = None
    adapter.rate_limiter = None
    res = await adapter.chat(_req())
    assert res.tool_calls is not None
    assert res.tool_calls[0]["name"] == "sum"


def test_prompt_cache_key_added() -> None:
    adapter = object.__new__(LiteLLMAdapter)
    req = _req(prompt_cache=PromptCachePolicy(enabled=True, strategy="provider"))
    payload = adapter._build_payload(req)
    assert "prompt_cache_key" in payload


def test_build_payload_sends_canonical_model_for_known_alias() -> None:
    adapter = object.__new__(LiteLLMAdapter)
    payload = adapter._build_payload(_req(model="gpt-4.1-mini", provider_params={"top_p": 0.5}))
    assert payload["model"] == "openai/gpt-4.1-mini"
    assert payload["top_p"] == 0.5
