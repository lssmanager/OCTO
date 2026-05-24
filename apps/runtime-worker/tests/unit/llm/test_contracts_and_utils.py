from __future__ import annotations

from decimal import Decimal

import pytest

from app.adapters.llm.error_mapper import map_http_error
from app.adapters.llm.provider_params import allowlisted_provider_params
from app.contracts.llm import CanonicalChatMessage, ChatCompletionRequest, ChatUsage


def test_chat_completion_request_validation() -> None:
    req = ChatCompletionRequest(
        tenant_id="t1",
        execution_id="e1",
        agent_id="a1",
        model="openai/gpt-4.1-mini",
        messages=[CanonicalChatMessage(role="user", content="hi")],
        reasoning_effort="high",
    )
    assert req.routing_strategy == "default"


def test_usage_decimal_cost() -> None:
    usage = ChatUsage(provider="openai", model="x", estimated_cost_usd=Decimal("0.1"))
    assert isinstance(usage.estimated_cost_usd, Decimal)


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        (429, "LLM_RATE_LIMITED", True),
        (408, "LLM_TIMEOUT", True),
        (500, "LLM_PROVIDER_UNAVAILABLE", True),
        (400, "LLM_BAD_REQUEST", False),
        (401, "LLM_PROVIDER_AUTH_FAILED", False),
    ],
)
def test_error_mapper(status: int, code: str, retryable: bool) -> None:
    err = map_http_error(status, "x")
    assert err.canonical_code == code
    assert err.retryable is retryable


def test_provider_params_allowlist() -> None:
    got = allowlisted_provider_params("openai/gpt-4.1-mini", {"reasoning_effort": "high", "base_url": "evil", "foo": 1})
    assert got == {"reasoning_effort": "high"}
