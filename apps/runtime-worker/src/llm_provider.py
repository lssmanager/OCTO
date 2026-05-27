from __future__ import annotations

import asyncio
import os
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any



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


def resolve_models_from_snapshot(snapshot: dict[str, Any], env_default: str) -> list[str]:
    candidates: list[str] = []
    paths = [
        ("agent", "modelPolicy", "primaryModel"),
        ("workspace", "modelPolicy", "primaryModel"),
        ("department", "modelPolicy", "primaryModel"),
        ("agency", "modelPolicy", "primaryModel"),
        ("global", "defaultModel"),
    ]
    for p in paths:
        cur: Any = snapshot
        for k in p:
            if not isinstance(cur, dict):
                cur = None
                break
            cur = cur.get(k)
        if isinstance(cur, str) and cur and cur not in candidates:
            candidates.append(cur)
    if env_default and env_default not in candidates:
        candidates.append(env_default)
    if os.environ.get("OCTO_TEST_LLM_FAKE", "false").lower() == "true" and "fake/f1-test" not in candidates:
        candidates.append("fake/f1-test")
    return candidates


async def call_llm(tenant_id: str, execution_id: str, agent_id: str, messages: list[dict[str, Any]], snapshot: dict[str, Any]) -> LLMCallResult:
    fake_mode = os.environ.get("OCTO_TEST_LLM_FAKE", "false").lower()
    if fake_mode == "true":
        return LLMCallResult(
            content="F1 fake LLM response",
            tool_calls=None,
            finish_reason="stop",
            usage={"input_tokens": 10, "output_tokens": 5, "total_tokens": 15, "estimated_cost_usd": "0"},
            provider="fake",
            model="fake/f1-test",
            retry_count=0,
            fallback_level=0,
            accounting_error=False,
        )
    if fake_mode in {"tool_echo", "tool_math_add", "tool_unknown", "tool_invalid_args"}:
        if any(m.get('role') == 'tool' for m in messages):
            return LLMCallResult(content="Tool result received and finalized", tool_calls=None, finish_reason="stop", usage={"input_tokens": 20, "output_tokens": 10, "total_tokens": 30, "estimated_cost_usd": "0"}, provider="fake", model="fake/f1-test", retry_count=0, fallback_level=0, accounting_error=False)
        call = {"id": "tc1", "name": "builtin.echo", "arguments_json": '{"text":"hello"}'}
        if fake_mode == "tool_math_add":
            call = {"id": "tc1", "name": "builtin.math_add", "arguments_json": '{"a":2,"b":3}'}
        if fake_mode == "tool_unknown":
            call = {"id": "tc1", "name": "builtin.unknown", "arguments_json": '{"x":1}'}
        if fake_mode == "tool_invalid_args":
            call = {"id": "tc1", "name": "builtin.math_add", "arguments_json": '{"a":"oops"}'}
        return LLMCallResult(content="", tool_calls=[call], finish_reason="tool_calls", usage={"input_tokens": 15, "output_tokens": 8, "total_tokens": 23, "estimated_cost_usd": "0"}, provider="fake", model="fake/f1-test", retry_count=0, fallback_level=0, accounting_error=False)

    import httpx

    base = os.environ.get("LITELLM_BASE_URL", os.environ.get("LITELLM_URL", "http://litellm:4000"))
    api_key = os.environ.get("LITELLM_API_KEY", "")
    timeout_ms = min(int(os.environ.get("LITELLM_TIMEOUT_MS", "90000")), 300000)
    max_retries = min(int(os.environ.get("LITELLM_MAX_RETRIES", "3")), 5)
    models = resolve_models_from_snapshot(snapshot, os.environ.get("LITELLM_DEFAULT_MODEL", ""))
    if not models:
        raise RuntimeError("LLM_MODEL_NOT_ALLOWED")

    headers = {"x-tenant-id": tenant_id, "x-execution-id": execution_id, "x-agent-id": agent_id}
    if api_key:
        headers["authorization"] = f"Bearer {api_key}"

    retryable_statuses = {408, 429, 500, 502, 503, 504}
    last_err: Exception | None = None
    for level, model in enumerate(models):
        for attempt in range(max_retries):
            try:
                start = time.perf_counter()
                async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
                    r = await client.post(
                        f"{base.rstrip('/')}/chat/completions",
                        headers=headers,
                        json={"model": model, "messages": messages, "temperature": 0.2, "max_tokens": 2048, "stream": False},
                    )
                if r.status_code >= 400:
                    if r.status_code in retryable_statuses and attempt + 1 < max_retries:
                        await asyncio.sleep([2, 10, 30][min(attempt, 2)])
                        continue
                    if r.status_code in retryable_statuses:
                        raise RuntimeError("LLM_PROVIDER_UNAVAILABLE")
                    raise RuntimeError("LLM_BAD_REQUEST")

                data = r.json()
                choice = ((data.get("choices") or [{}])[0])
                msg = choice.get("message") or {}
                usage = data.get("usage") or {}
                accounting_error = not all(k in usage for k in ["prompt_tokens", "completion_tokens", "total_tokens"])
                latency_ms = int((time.perf_counter() - start) * 1000)
                return LLMCallResult(
                    content=msg.get("content") or "",
                    tool_calls=msg.get("tool_calls"),
                    finish_reason=choice.get("finish_reason", "error"),
                    usage={
                        "input_tokens": int(usage.get("prompt_tokens", 0) or 0),
                        "output_tokens": int(usage.get("completion_tokens", 0) or 0),
                        "total_tokens": int(usage.get("total_tokens", 0) or 0),
                        "estimated_cost_usd": str((data.get("_hidden_params") or {}).get("response_cost", "0")),
                        "latency_ms": latency_ms,
                    },
                    provider=model.split("/", 1)[0],
                    model=model,
                    retry_count=attempt,
                    fallback_level=level,
                    accounting_error=accounting_error,
                )
            except (httpx.TimeoutException, httpx.NetworkError) as exc:
                last_err = exc
                if attempt + 1 < max_retries:
                    await asyncio.sleep([2, 10, 30][min(attempt, 2)])
                    continue
                break
        # try fallback model on retryable failures
        continue
    raise RuntimeError(f"LLM_PROVIDER_UNAVAILABLE: {last_err}")
