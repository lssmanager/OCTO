from __future__ import annotations

from typing import Any

PROVIDER_ALLOWLIST: dict[str, set[str]] = {
    "openai": {"reasoning_effort", "prompt_cache_key", "response_format", "parallel_tool_calls", "top_p", "presence_penalty", "frequency_penalty", "seed", "stop"},
    "anthropic": {"cache_control", "thinking", "top_k", "stop"},
    "gemini": {"thinking_config", "response_schema", "response_mime_type", "stop"},
    "deepseek": {"reasoning_effort", "response_format", "stop"},
}

PROVIDER_ALIAS_PREFIXES: dict[str, tuple[str, ...]] = {
    "openai": ("gpt-", "o1", "o3", "o4", "omni-", "text-embedding-"),
    "anthropic": ("claude",),
    "gemini": ("gemini",),
    "deepseek": ("deepseek",),
}

BLOCKED_KEYS = {"model", "messages", "metadata", "api_key", "base_url", "headers", "timeout"}


def resolve_provider(model: str) -> str:
    normalized = model.strip().lower()
    if "/" in normalized:
        return normalized.split("/", 1)[0]
    for provider, prefixes in PROVIDER_ALIAS_PREFIXES.items():
        if any(normalized.startswith(prefix) for prefix in prefixes):
            return provider
    return "unknown"


def allowlisted_provider_params(model: str, provider_params: dict[str, Any] | None) -> dict[str, Any]:
    if not provider_params:
        return {}
    provider = resolve_provider(model)
    if provider == "unknown":
        return {}
    allowed = PROVIDER_ALLOWLIST.get(provider, set())
    out: dict[str, Any] = {}
    for k, v in provider_params.items():
        if k in BLOCKED_KEYS:
            continue
        if k in allowed:
            out[k] = v
    return out
