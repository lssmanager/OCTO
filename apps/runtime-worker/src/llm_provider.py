from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

from app.adapters.llm.provider_params import canonical_model_identifier, canonical_model_set, resolve_provider


class GovernedLLMError(RuntimeError):
    """Runtime-visible LLM policy/budget error with an F1 governance code."""

    def __init__(self, code: str, message: str | None = None, *, retryable: bool = False) -> None:
        super().__init__(message or code)
        self.code = code
        self.retryable = retryable


@dataclass(frozen=True)
class BudgetPolicy:
    max_usd_per_run: Decimal | None = None
    min_reserved_cost_usd: Decimal = Decimal("0.000001")
    current_spend_usd: Decimal = Decimal("0")
    on_exhaust: str = "fail"


@dataclass(frozen=True)
class EffectiveLLMPolicy:
    primary_model: str
    fallback_chain: list[str]
    allowed_models: set[str] = field(default_factory=set)
    registered_models: set[str] = field(default_factory=set)
    budget: BudgetPolicy = field(default_factory=BudgetPolicy)

    @property
    def candidates(self) -> list[str]:
        return [self.primary_model, *self.fallback_chain]


@dataclass
class LLMCallResult:
    content: str
    tool_calls: list[dict[str, Any]] | None
    finish_reason: str
    usage: dict[str, Any]
    provider: str
    model: str
    retry_count: int
    fallback_level: int
    accounting_error: bool
    accounting_error_reason: str | None = None
    attempted_models: list[str] = field(default_factory=list)


def _unique(values: list[str]) -> list[str]:
    out: list[str] = []
    for value in values:
        if value and value not in out:
            out.append(value)
    return out


def _get_path(root: dict[str, Any], *path: str) -> Any:
    cur: Any = root
    for key in path:
        if not isinstance(cur, dict):
            return None
        cur = cur.get(key)
    return cur


def _as_str_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [item for item in value if isinstance(item, str) and item]
    return []


def _as_decimal(value: Any, default: Decimal | None = None) -> Decimal | None:
    if value is None:
        return default
    try:
        return Decimal(str(value))
    except (InvalidOperation, ValueError):
        return default


def _model_set_from(value: Any) -> set[str]:
    if isinstance(value, list):
        out: set[str] = set()
        for item in value:
            if isinstance(item, str) and item:
                out.add(item)
            elif isinstance(item, dict):
                model = item.get("model") or item.get("id") or item.get("name")
                if isinstance(model, str) and model:
                    out.add(model)
        return out
    if isinstance(value, dict):
        return {str(key) for key, enabled in value.items() if enabled is not False}
    return set()


def _budget_from_snapshot(snapshot: dict[str, Any]) -> BudgetPolicy:
    raw = snapshot.get("budgetPolicy")
    if not isinstance(raw, dict):
        raw = (
            snapshot.get("budget_policy") if isinstance(snapshot.get("budget_policy"), dict) else {}
        )
    max_value = raw.get("maxUsdPerRun", raw.get("max_usd_per_run"))
    reserve_value = raw.get("minReservedCostUsd", raw.get("min_reserved_cost_usd"))
    spend_value = raw.get("currentSpendUsd", raw.get("current_spend_usd", raw.get("spentUsd")))
    return BudgetPolicy(
        max_usd_per_run=_as_decimal(max_value),
        min_reserved_cost_usd=_as_decimal(reserve_value, Decimal("0.000001"))
        or Decimal("0.000001"),
        current_spend_usd=_as_decimal(spend_value, Decimal("0")) or Decimal("0"),
        on_exhaust=str(raw.get("onExhaust", raw.get("on_exhaust", "fail"))),
    )


def _explicit_model_policy(
    snapshot: dict[str, Any],
) -> tuple[str, list[str], set[str], set[str]] | None:
    raw = snapshot.get("modelPolicy")
    if not isinstance(raw, dict):
        raw = (
            snapshot.get("model_policy")
            if isinstance(snapshot.get("model_policy"), dict)
            else None
        )
    if not isinstance(raw, dict):
        return None
    primary = raw.get("primaryModel", raw.get("primary_model"))
    fallbacks = _unique(
        [
            *_as_str_list(raw.get("fallbackChain", raw.get("fallback_chain"))),
            *_as_str_list(raw.get("fallbackModels", raw.get("fallback_models"))),
        ]
    )
    allowed = set(_as_str_list(raw.get("allowedModels", raw.get("allowed_models"))))
    registered = set(_as_str_list(raw.get("registeredModels", raw.get("registered_models"))))
    if isinstance(primary, str) and primary:
        return primary, fallbacks, allowed, registered
    return None


def _hierarchy_models(snapshot: dict[str, Any], env_default: str) -> tuple[str, list[str]]:
    candidates: list[str] = []
    levels = ["subagent", "agent", "workspace", "department", "agency"]
    for level in levels:
        raw = _get_path(snapshot, level, "modelPolicy")
        if not isinstance(raw, dict):
            raw = _get_path(snapshot, level, "model_policy")
        if not isinstance(raw, dict):
            continue
        primary = raw.get("primaryModel", raw.get("primary_model"))
        if isinstance(primary, str) and primary:
            candidates.append(primary)
        candidates.extend(_as_str_list(raw.get("fallbackChain", raw.get("fallback_chain"))))
        candidates.extend(_as_str_list(raw.get("fallbackModels", raw.get("fallback_models"))))
    default_model = _get_path(snapshot, "global", "defaultModel")
    if isinstance(default_model, str) and default_model:
        candidates.append(default_model)
    if env_default:
        candidates.append(env_default)
    if os.environ.get("OCTO_TEST_LLM_FAKE", "false").lower() == "true":
        candidates.append("fake/f1-test")
    candidates = _unique(candidates)
    primary = candidates[0] if candidates else ""
    return primary, candidates[1:]


def resolve_effective_policy(snapshot: dict[str, Any], env_default: str = "") -> EffectiveLLMPolicy:
    explicit = _explicit_model_policy(snapshot)
    if explicit:
        primary, fallbacks, policy_allowed, policy_registered = explicit
    else:
        primary, fallbacks = _hierarchy_models(snapshot, env_default)
        policy_allowed = set()
        policy_registered = set()

    chain = _unique(canonical_model_identifier(model) for model in [primary, *fallbacks])
    if not chain:
        raise GovernedLLMError("LLM_MODEL_POLICY_MISSING", "No LLM model policy resolved")
    primary = chain[0]
    fallbacks = chain[1:]

    registered = canonical_model_set(
        policy_registered
        or _model_set_from(snapshot.get("registeredModels"))
        or _model_set_from(snapshot.get("modelRegistry"))
        or _model_set_from(_get_path(snapshot, "governance", "registeredModels"))
        or _model_set_from(_get_path(snapshot, "governance", "modelRegistry"))
    )
    allowed = canonical_model_set(
        policy_allowed
        or _model_set_from(snapshot.get("allowedModels"))
        or _model_set_from(_get_path(snapshot, "governance", "allowedModels"))
    )

    for model in chain:
        if registered and model not in registered:
            raise GovernedLLMError("LLM_MODEL_NOT_REGISTERED", f"Model not registered: {model}")
        if allowed and model not in allowed:
            raise GovernedLLMError("LLM_MODEL_NOT_ALLOWED", f"Model not allowed by policy: {model}")

    return EffectiveLLMPolicy(
        primary_model=primary,
        fallback_chain=fallbacks,
        allowed_models=allowed,
        registered_models=registered,
        budget=_budget_from_snapshot(snapshot),
    )


def resolve_models_from_snapshot(snapshot: dict[str, Any], env_default: str) -> list[str]:
    return resolve_effective_policy(snapshot, env_default).candidates


def _provider_from_model(model: str) -> str:
    return resolve_provider(canonical_model_identifier(model))


def _check_budget(policy: EffectiveLLMPolicy, projected_spend: Decimal, *, model: str) -> None:
    max_run = policy.budget.max_usd_per_run
    if max_run is None:
        return
    remaining = max_run - policy.budget.current_spend_usd - projected_spend
    if remaining < policy.budget.min_reserved_cost_usd:
        raise GovernedLLMError(
            "LLM_BUDGET_EXCEEDED", f"Budget exhausted before LLM call for model: {model}"
        )


def _cost_from_usage(usage: dict[str, Any]) -> Decimal:
    return _as_decimal(usage.get("estimated_cost_usd"), Decimal("0")) or Decimal("0")


def _budget_snapshot(policy: EffectiveLLMPolicy) -> dict[str, str | None]:
    return {
        "max_usd_per_run": str(policy.budget.max_usd_per_run)
        if policy.budget.max_usd_per_run is not None
        else None,
        "min_reserved_cost_usd": str(policy.budget.min_reserved_cost_usd),
        "current_spend_usd": str(policy.budget.current_spend_usd),
        "on_exhaust": policy.budget.on_exhaust,
    }


def _governed_usage(
    usage: dict[str, Any],
    *,
    policy: EffectiveLLMPolicy,
    model: str,
    fallback_level: int,
    attempted_models: list[str],
    accounting_error: bool = False,
    accounting_error_reason: str | None = None,
) -> dict[str, Any]:
    cost = str(usage.get("estimated_cost_usd", "0"))
    return {
        **usage,
        "estimated_cost_usd": cost,
        "model": model,
        "provider": _provider_from_model(model),
        "fallback_level": fallback_level,
        "attempted_models": list(attempted_models),
        "budget_policy": _budget_snapshot(policy),
        "accounting_error": accounting_error,
        "accounting_error_reason": accounting_error_reason,
    }


async def call_llm(
    tenant_id: str,
    execution_id: str,
    agent_id: str,
    messages: list[dict[str, Any]],
    snapshot: dict[str, Any],
) -> LLMCallResult:
    policy = resolve_effective_policy(snapshot, os.environ.get("LITELLM_DEFAULT_MODEL", ""))
    fake_mode = os.environ.get("OCTO_TEST_LLM_FAKE", "false").lower()
    if fake_mode == "true":
        model = policy.primary_model if policy.primary_model else "fake/f1-test"
        _check_budget(policy, Decimal("0"), model=model)
        attempted_models = [model]
        return LLMCallResult(
            content="F1 fake LLM response",
            tool_calls=None,
            finish_reason="stop",
            usage=_governed_usage(
                {
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "total_tokens": 15,
                    "estimated_cost_usd": "0",
                },
                policy=policy,
                model=model,
                fallback_level=0,
                attempted_models=attempted_models,
            ),
            provider=_provider_from_model(model),
            model=model,
            retry_count=0,
            fallback_level=0,
            accounting_error=False,
            attempted_models=attempted_models,
        )
    if fake_mode in {"tool_echo", "tool_math_add", "tool_unknown", "tool_invalid_args"}:
        model = policy.primary_model if policy.primary_model else "fake/f1-test"
        _check_budget(policy, Decimal("0"), model=model)
        if any(m.get("role") == "tool" for m in messages):
            return LLMCallResult(
                content="Tool result received and finalized",
                tool_calls=None,
                finish_reason="stop",
                usage=_governed_usage(
                    {
                        "input_tokens": 20,
                        "output_tokens": 10,
                        "total_tokens": 30,
                        "estimated_cost_usd": "0",
                    },
                    policy=policy,
                    model=model,
                    fallback_level=0,
                    attempted_models=[model],
                ),
                provider=_provider_from_model(model),
                model=model,
                retry_count=0,
                fallback_level=0,
                accounting_error=False,
                attempted_models=[model],
            )
        call = {"id": "tc1", "name": "builtin.echo", "arguments_json": '{"text":"hello"}'}
        if fake_mode == "tool_math_add":
            call = {"id": "tc1", "name": "builtin.math_add", "arguments_json": '{"a":2,"b":3}'}
        if fake_mode == "tool_unknown":
            call = {"id": "tc1", "name": "builtin.unknown", "arguments_json": '{"x":1}'}
        if fake_mode == "tool_invalid_args":
            call = {"id": "tc1", "name": "builtin.math_add", "arguments_json": '{"a":"oops"}'}
        return LLMCallResult(
            content="",
            tool_calls=[call],
            finish_reason="tool_calls",
            usage=_governed_usage(
                {
                    "input_tokens": 15,
                    "output_tokens": 8,
                    "total_tokens": 23,
                    "estimated_cost_usd": "0",
                },
                policy=policy,
                model=model,
                fallback_level=0,
                attempted_models=[model],
            ),
            provider=_provider_from_model(model),
            model=model,
            retry_count=0,
            fallback_level=0,
            accounting_error=False,
            attempted_models=[model],
        )

    import httpx

    base = os.environ.get("LITELLM_BASE_URL", os.environ.get("LITELLM_URL", "http://litellm:4000"))
    api_key = os.environ.get("LITELLM_API_KEY") or os.environ.get("LITELLM_MASTER_KEY", "")
    timeout_ms = min(int(os.environ.get("LITELLM_TIMEOUT_MS", "90000")), 300000)
    max_retries = min(int(os.environ.get("LITELLM_MAX_RETRIES", "3")), 5)

    headers = {"x-tenant-id": tenant_id, "x-execution-id": execution_id, "x-agent-id": agent_id}
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"

    retryable_statuses = {408, 429, 500, 502, 503, 504}
    last_err: Exception | None = None
    attempted_models: list[str] = []
    cumulative_spend = Decimal("0")
    for level, model in enumerate(policy.candidates):
        _check_budget(policy, cumulative_spend, model=model)
        attempted_models.append(model)
        for attempt in range(max_retries):
            try:
                start = time.perf_counter()
                async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
                    r = await client.post(
                        f"{base.rstrip('/')}/chat/completions",
                        headers=headers,
                        json={
                            "model": model,
                            "messages": messages,
                            "temperature": 0.2,
                            "max_tokens": 2048,
                            "stream": False,
                        },
                    )
                if r.status_code >= 400:
                    if r.status_code in retryable_statuses and attempt + 1 < max_retries:
                        await asyncio.sleep([2, 10, 30][min(attempt, 2)])
                        continue
                    if r.status_code in retryable_statuses:
                        raise RuntimeError("LLM_PROVIDER_UNAVAILABLE")
                    raise GovernedLLMError(
                        "LLM_PROVIDER_BAD_REQUEST",
                        f"LiteLLM rejected request with status {r.status_code}",
                        retryable=False,
                    )

                data = r.json()
                choice = (data.get("choices") or [{}])[0]
                msg = choice.get("message") or {}
                usage = data.get("usage") or {}
                missing = [
                    k
                    for k in ["prompt_tokens", "completion_tokens", "total_tokens"]
                    if k not in usage
                ]
                accounting_error = bool(missing)
                cost = str((data.get("_hidden_params") or {}).get("response_cost", "0"))
                normalized_usage = {
                    "input_tokens": int(usage.get("prompt_tokens", 0) or 0),
                    "output_tokens": int(usage.get("completion_tokens", 0) or 0),
                    "total_tokens": int(usage.get("total_tokens", 0) or 0),
                    "estimated_cost_usd": cost,
                    "cost_source": "litellm.response_cost",
                    "latency_ms": int((time.perf_counter() - start) * 1000),
                }
                cumulative_spend += _cost_from_usage(normalized_usage)
                if (
                    policy.budget.max_usd_per_run is not None
                    and policy.budget.current_spend_usd + cumulative_spend
                    > policy.budget.max_usd_per_run
                ):
                    raise GovernedLLMError(
                        "LLM_BUDGET_RECONCILIATION_EXCEEDED",
                        f"LLM usage exceeded budget after provider accounting for model: {model}",
                    )
                return LLMCallResult(
                    content=msg.get("content") or "",
                    tool_calls=msg.get("tool_calls"),
                    finish_reason=choice.get("finish_reason", "error"),
                    usage=_governed_usage(
                        normalized_usage,
                        policy=policy,
                        model=model,
                        fallback_level=level,
                        attempted_models=attempted_models,
                        accounting_error=accounting_error,
                        accounting_error_reason=("missing usage fields: " + ",".join(missing))
                        if missing
                        else None,
                    ),
                    provider=_provider_from_model(model),
                    model=model,
                    retry_count=attempt,
                    fallback_level=level,
                    accounting_error=accounting_error,
                    accounting_error_reason=("missing usage fields: " + ",".join(missing))
                    if missing
                    else None,
                    attempted_models=attempted_models,
                )
            except GovernedLLMError:
                raise
            except (
                Exception
            ) as exc:  # network/client errors can fall through to policy fallback chain
                last_err = exc
                if attempt + 1 < max_retries:
                    await asyncio.sleep([2, 10, 30][min(attempt, 2)])
                    continue
                break
    raise GovernedLLMError(
        "LLM_PROVIDER_UNAVAILABLE", str(last_err or "all providers unavailable"), retryable=True
    )
