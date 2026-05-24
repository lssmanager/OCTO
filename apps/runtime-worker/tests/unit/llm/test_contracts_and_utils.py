from __future__ import annotations

from decimal import Decimal

import pytest

from app.adapters.llm.error_mapper import map_http_error
from app.adapters.llm.model_policy import BudgetPolicySnapshot, is_fallback_eligible
from app.adapters.llm.provider_params import allowlisted_provider_params
from app.contracts.llm import CanonicalChatMessage, ChatCompletionRequest, ChatUsage


def test_chat_completion_request_validation() -> None:
    req = ChatCompletionRequest(
        tenant_id="t1",
        execution_id="e1",
        agent_id="a1",
        model="openai/gpt-4.1-mini",
        messages=[CanonicalChatMessage(role="user", content="hi")],
    )
    assert req.max_output_tokens == 2048


def test_usage_decimal_cost() -> None:
    usage = ChatUsage(
        input_tokens=1,
        output_tokens=2,
        total_tokens=3,
        provider="openai",
        model="openai/gpt-4.1-mini",
        estimated_cost_usd=Decimal("0.000001"),
    )
    assert isinstance(usage.estimated_cost_usd, Decimal)


@pytest.mark.parametrize(
    ("status", "code", "retryable"),
    [
        (429, "LLM_RATE_LIMITED", True),
        (408, "LLM_TIMEOUT", True),
        (500, "LLM_PROVIDER_UNAVAILABLE", True),
        (400, "LLM_BAD_REQUEST", False),
        (401, "LLM_PROVIDER_AUTH_FAILED", False),
        (403, "LLM_PROVIDER_AUTH_FAILED", False),
    ],
)
def test_error_mapper(status: int, code: str, retryable: bool) -> None:
    err = map_http_error(status, "x")
    assert err.code == code
    assert err.retryable is retryable


def test_provider_params_allowlist() -> None:
    got = allowlisted_provider_params({"top_p": 0.9, "base_url": "evil", "seed": 1})
    assert got == {"top_p": 0.9, "seed": 1}


def test_fallback_eligibility() -> None:
    assert is_fallback_eligible("LLM_TIMEOUT")
    assert not is_fallback_eligible("LLM_PROVIDER_AUTH_FAILED")


def test_budget_policy_defaults() -> None:
    p = BudgetPolicySnapshot()
    assert p.on_exhaust == "fail"
    assert p.min_reserved_cost_usd == Decimal("0.000001")
