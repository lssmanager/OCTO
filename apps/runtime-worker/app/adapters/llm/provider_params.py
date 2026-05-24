from __future__ import annotations

from typing import Any

PROVIDER_ALLOWLIST: dict[str, set[str]] = {
    "openai": {"reasoning_effort", "prompt_cache_key", "response_format", "parallel_tool_calls", "top_p", "presence_penalty", "frequency_penalty", "seed", "stop"},
    "anthropic": {"cache_control", "thinking", "top_k", "stop"},
    "gemini": {"thinking_config", "response_schema", "response_mime_type", "stop"},
    "deepseek": {"reasoning_effort", "response_format", "stop"},
}

BLOCKED_KEYS = {"model", "messages", "metadata", "api_key", "base_url", "headers", "timeout"}


def resolve_provider(model: str) -> str:
    return model.split("/", 1)[0] if "/" in model else "unknown"


def allowlisted_provider_params(model: str, provider_params: dict[str, Any] | None) -> dict[str, Any]:
    if not provider_params:
        return {}
    provider = resolve_provider(model)
    allowed = PROVIDER_ALLOWLIST.get(provider, set())
    out: dict[str, Any] = {}
    for k, v in provider_params.items():
        if k in BLOCKED_KEYS:
            continue
        if not allowed or k in allowed:
            out[k] = v
    return out
