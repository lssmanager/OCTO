from __future__ import annotations

import hashlib
import json
from typing import Any, Protocol

from app.adapters.llm.provider_params import canonical_model_identifier
from app.contracts.llm import ChatCompletionRequest


class SemanticPromptCache(Protocol):
    async def lookup(self, req: ChatCompletionRequest) -> Any | None: ...

    async def store(self, req: ChatCompletionRequest, res: Any) -> None: ...


def _prompt_shape(req: ChatCompletionRequest, *, effective_model: str | None = None) -> dict[str, Any]:
    return {
        "tenant_id": req.tenant_id,
        "agent_id": req.agent_id,
        "model": effective_model or canonical_model_identifier(req.model),
        "messages": [m.model_dump(exclude_none=True) for m in req.messages],
        "tool_choice": req.tool_choice,
        "tools": [t.model_dump(exclude_none=True) for t in (req.tools or [])],
        "output_schema": req.output_schema,
        "reasoning_effort": req.reasoning_effort,
        "temperature": req.temperature,
        "max_output_tokens": req.max_output_tokens,
        "routing_strategy": req.routing_strategy,
    }


def make_prompt_cache_key(req: ChatCompletionRequest, *, effective_model: str | None = None) -> str:
    canonical = json.dumps(_prompt_shape(req, effective_model=effective_model), sort_keys=True, separators=(",", ":"), default=str)
    digest = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return f"octo-prompt-cache:{req.tenant_id}:{req.agent_id}:{effective_model or canonical_model_identifier(req.model)}:{digest}"


def _scoped_operator_key(req: ChatCompletionRequest, raw_key: str, *, effective_model: str | None = None) -> str:
    shape_key = make_prompt_cache_key(req, effective_model=effective_model)
    operator_digest = hashlib.sha256(raw_key.encode("utf-8")).hexdigest()[:16]
    return f"{shape_key}:operator:{operator_digest}"


def apply_prompt_cache(req: ChatCompletionRequest, provider: str, payload: dict[str, Any]) -> None:
    policy = req.prompt_cache
    if not policy or not policy.enabled:
        return
    effective_model = str(payload.get("model") or canonical_model_identifier(req.model))
    if provider == "openai":
        payload["prompt_cache_key"] = _scoped_operator_key(req, policy.cache_key, effective_model=effective_model) if policy.cache_key else make_prompt_cache_key(req, effective_model=effective_model)
    elif provider == "anthropic" and policy.provider_breakpoints:
        payload["cache_control"] = {"type": "ephemeral", "breakpoints": policy.provider_breakpoints}
