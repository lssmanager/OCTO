from __future__ import annotations

import asyncio
import sys
from types import SimpleNamespace
from typing import Any

import pytest

from src.llm_provider import (
    GovernedLLMError,
    call_llm,
    resolve_effective_policy,
    resolve_models_from_snapshot,
)


def test_model_routing_uses_effective_policy_chain() -> None:
    snapshot = {
        "modelPolicy": {
            "primaryModel": "openai/gpt-4.1-mini",
            "fallbackModels": ["anthropic/claude-3-5-sonnet", "gemini/gemini-2.5-flash"],
            "allowedModels": [
                "openai/gpt-4.1-mini",
                "anthropic/claude-3-5-sonnet",
                "gemini/gemini-2.5-flash",
            ],
        },
        "registeredModels": [
            "openai/gpt-4.1-mini",
            "anthropic/claude-3-5-sonnet",
            "gemini/gemini-2.5-flash",
        ],
    }
    got = resolve_models_from_snapshot(snapshot, "openai/gpt-4o-mini")
    assert got == ["openai/gpt-4.1-mini", "anthropic/claude-3-5-sonnet", "gemini/gemini-2.5-flash"]


def test_model_denied_by_policy_fails_governed() -> None:
    with pytest.raises(GovernedLLMError) as exc:
        resolve_effective_policy(
            {
                "modelPolicy": {
                    "primaryModel": "openai/gpt-4.1-mini",
                    "allowedModels": ["anthropic/claude-3-5-sonnet"],
                }
            }
        )
    assert exc.value.code == "LLM_MODEL_NOT_ALLOWED"


def test_model_not_registered_fails_governed() -> None:
    with pytest.raises(GovernedLLMError) as exc:
        resolve_effective_policy(
            {
                "modelPolicy": {"primaryModel": "openai/gpt-4.1-mini"},
                "registeredModels": ["anthropic/claude-3-5-sonnet"],
            }
        )
    assert exc.value.code == "LLM_MODEL_NOT_REGISTERED"


def test_budget_insufficient_blocks_fake_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCTO_TEST_LLM_FAKE", "true")
    snapshot = {
        "modelPolicy": {"primaryModel": "fake/f1-test"},
        "registeredModels": ["fake/f1-test"],
        "budgetPolicy": {"maxUsdPerRun": "0", "minReservedCostUsd": "0.000001"},
    }
    with pytest.raises(GovernedLLMError) as exc:
        asyncio.run(call_llm("t1", "e1", "a1", [{"role": "user", "content": "hi"}], snapshot))
    assert exc.value.code == "LLM_BUDGET_EXCEEDED"


def test_fake_mode_returns_deterministic(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("OCTO_TEST_LLM_FAKE", "true")
    snapshot = {
        "modelPolicy": {"primaryModel": "fake/f1-test"},
        "registeredModels": ["fake/f1-test"],
    }

    res = asyncio.run(call_llm("t1", "e1", "a1", [{"role": "user", "content": "hi"}], snapshot))
    assert res.content == "F1 fake LLM response"
    assert res.usage["total_tokens"] == 15
    assert res.model == "fake/f1-test"


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict[str, Any] | None = None) -> None:
        self.status_code = status_code
        self._payload = payload or {}

    def json(self) -> dict[str, Any]:
        return self._payload


class _FakeAsyncClient:
    responses: list[_FakeResponse] = []
    requests: list[dict[str, Any]] = []

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        pass

    async def __aenter__(self) -> _FakeAsyncClient:
        return self

    async def __aexit__(self, *args: Any) -> None:
        return None

    async def post(
        self, url: str, *, headers: dict[str, Any], json: dict[str, Any]
    ) -> _FakeResponse:
        self.requests.append(json)
        return self.responses.pop(0)


def test_fallback_respects_policy_order_on_retryable_status(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setitem(sys.modules, "httpx", SimpleNamespace(AsyncClient=_FakeAsyncClient))
    monkeypatch.setenv("LITELLM_MAX_RETRIES", "1")
    _FakeAsyncClient.requests = []
    _FakeAsyncClient.responses = [
        _FakeResponse(429),
        _FakeResponse(
            200,
            {
                "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
                "_hidden_params": {"response_cost": "0.00001"},
            },
        ),
    ]
    snapshot = {
        "modelPolicy": {"primaryModel": "openai/primary", "fallbackModels": ["anthropic/fallback"]},
        "registeredModels": ["openai/primary", "anthropic/fallback"],
    }

    res = asyncio.run(call_llm("t1", "e1", "a1", [{"role": "user", "content": "hi"}], snapshot))

    assert [request["model"] for request in _FakeAsyncClient.requests] == [
        "openai/primary",
        "anthropic/fallback",
    ]
    assert res.model == "anthropic/fallback"
    assert res.fallback_level == 1


def test_accounting_incomplete_is_visible(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "httpx", SimpleNamespace(AsyncClient=_FakeAsyncClient))
    monkeypatch.setenv("LITELLM_MAX_RETRIES", "1")
    _FakeAsyncClient.requests = []
    _FakeAsyncClient.responses = [
        _FakeResponse(
            200,
            {
                "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 3},
                "_hidden_params": {"response_cost": "0.00001"},
            },
        ),
    ]
    snapshot = {
        "modelPolicy": {"primaryModel": "openai/primary"},
        "registeredModels": ["openai/primary"],
    }

    res = asyncio.run(call_llm("t1", "e1", "a1", [{"role": "user", "content": "hi"}], snapshot))

    assert res.accounting_error is True
    assert res.accounting_error_reason == "missing usage fields: completion_tokens,total_tokens"
    assert res.usage["estimated_cost_usd"] == "0.00001"


def test_fallback_chain_field_takes_policy_order() -> None:
    snapshot = {
        "modelPolicy": {
            "primaryModel": "openai/primary",
            "fallbackChain": ["anthropic/first", "gemini/second"],
            "fallbackModels": ["openai/legacy"],
            "allowedModels": ["openai/primary", "anthropic/first", "gemini/second", "openai/legacy"],
            "registeredModels": ["openai/primary", "anthropic/first", "gemini/second", "openai/legacy"],
        }
    }

    got = resolve_models_from_snapshot(snapshot, "")

    assert got == ["openai/primary", "anthropic/first", "gemini/second", "openai/legacy"]


def test_model_policy_registered_models_are_enforced() -> None:
    with pytest.raises(GovernedLLMError) as exc:
        resolve_effective_policy(
            {
                "modelPolicy": {
                    "primaryModel": "openai/primary",
                    "registeredModels": ["anthropic/only"],
                }
            }
        )

    assert exc.value.code == "LLM_MODEL_NOT_REGISTERED"


def test_success_usage_includes_governance_metadata(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "httpx", SimpleNamespace(AsyncClient=_FakeAsyncClient))
    monkeypatch.setenv("LITELLM_MAX_RETRIES", "1")
    _FakeAsyncClient.requests = []
    _FakeAsyncClient.responses = [
        _FakeResponse(
            200,
            {
                "choices": [{"message": {"content": "ok"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
                "_hidden_params": {"response_cost": "0.00001"},
            },
        ),
    ]
    snapshot = {
        "modelPolicy": {"primaryModel": "openai/primary"},
        "registeredModels": ["openai/primary"],
        "budgetPolicy": {"maxUsdPerRun": "1.00", "currentSpendUsd": "0.10"},
    }

    res = asyncio.run(call_llm("t1", "e1", "a1", [{"role": "user", "content": "hi"}], snapshot))

    assert res.usage["model"] == "openai/primary"
    assert res.usage["provider"] == "openai"
    assert res.usage["attempted_models"] == ["openai/primary"]
    assert res.usage["budget_policy"]["max_usd_per_run"] == "1.00"
    assert res.usage["cost_source"] == "litellm.response_cost"


def test_budget_reconciliation_blocks_overrun_after_usage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setitem(sys.modules, "httpx", SimpleNamespace(AsyncClient=_FakeAsyncClient))
    monkeypatch.setenv("LITELLM_MAX_RETRIES", "1")
    _FakeAsyncClient.requests = []
    _FakeAsyncClient.responses = [
        _FakeResponse(
            200,
            {
                "choices": [{"message": {"content": "too expensive"}, "finish_reason": "stop"}],
                "usage": {"prompt_tokens": 3, "completion_tokens": 2, "total_tokens": 5},
                "_hidden_params": {"response_cost": "0.20"},
            },
        ),
    ]
    snapshot = {
        "modelPolicy": {"primaryModel": "openai/primary"},
        "registeredModels": ["openai/primary"],
        "budgetPolicy": {"maxUsdPerRun": "0.10", "minReservedCostUsd": "0"},
    }

    with pytest.raises(GovernedLLMError) as exc:
        asyncio.run(call_llm("t1", "e1", "a1", [{"role": "user", "content": "hi"}], snapshot))

    assert exc.value.code == "LLM_BUDGET_RECONCILIATION_EXCEEDED"


def test_model_allowlist_checks_canonical_final_identifier() -> None:
    policy = resolve_effective_policy(
        {
            "modelPolicy": {
                "primaryModel": "gpt-4.1-mini",
                "registeredModels": ["openai/gpt-4.1-mini"],
                "allowedModels": ["openai/gpt-4.1-mini"],
            }
        }
    )

    assert policy.primary_model == "openai/gpt-4.1-mini"


def test_model_allowlist_rejects_unknown_alias_even_if_provider_prefix_allowed() -> None:
    with pytest.raises(GovernedLLMError) as exc:
        resolve_effective_policy(
            {
                "modelPolicy": {
                    "primaryModel": "custom-safe-alias",
                    "registeredModels": ["openai/gpt-4.1-mini"],
                    "allowedModels": ["openai/gpt-4.1-mini"],
                }
            }
        )
    assert exc.value.code == "LLM_MODEL_NOT_REGISTERED"
