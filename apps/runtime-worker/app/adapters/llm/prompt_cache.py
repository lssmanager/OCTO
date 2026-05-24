from __future__ import annotations

import hashlib
from typing import Any, Protocol

from app.contracts.llm import ChatCompletionRequest


class SemanticPromptCache(Protocol):
    async def lookup(self, req: ChatCompletionRequest) -> Any | None: ...

    async def store(self, req: ChatCompletionRequest, res: Any) -> None: ...


def make_prompt_cache_key(req: ChatCompletionRequest) -> str:
    stable_prefix = "|".join(
        str(m.content)[:128] for m in req.messages if m.role in {"system", "user"}
    )
    digest = hashlib.sha256(stable_prefix.encode("utf-8")).hexdigest()[:20]
    return f"{req.tenant_id}:{req.agent_id}:{req.model}:{digest}"


def apply_prompt_cache(req: ChatCompletionRequest, provider: str, payload: dict[str, Any]) -> None:
    policy = req.prompt_cache
    if not policy or not policy.enabled:
        return
    if provider == "openai":
        payload["prompt_cache_key"] = policy.cache_key or make_prompt_cache_key(req)
    elif provider == "anthropic" and policy.provider_breakpoints:
        payload["cache_control"] = {"type": "ephemeral", "breakpoints": policy.provider_breakpoints}
