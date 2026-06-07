from __future__ import annotations

import json

from app.adapters.llm.provider_params import canonical_model_identifier
from app.cache.cache_key import hash_cache_key
from app.cache.cache_safety import is_safe_for_cache
from app.contracts.llm import ChatCompletionRequest, ChatCompletionResponse


class QdrantSemanticCache:
    def __init__(self, backend: object | None = None) -> None:
        self.backend = backend
        self._local: dict[str, ChatCompletionResponse] = {}

    def _fingerprint(self, req: ChatCompletionRequest) -> dict[str, object]:
        return {
            "tenant_id": req.tenant_id,
            "agent_id": req.agent_id,
            "model": canonical_model_identifier(req.model),
            "messages": [m.model_dump(exclude_none=True) for m in req.messages],
            "tool_choice": req.tool_choice,
            "tools_present": bool(req.tools),
            "reasoning_effort": req.reasoning_effort,
            "output_schema": req.output_schema,
            "temperature": req.temperature,
            "max_output_tokens": req.max_output_tokens,
            "routing_strategy": req.routing_strategy,
            "provider_params": req.provider_params or {},
        }

    def _key(self, req: ChatCompletionRequest) -> str:
        canonical = json.dumps(self._fingerprint(req), sort_keys=True, separators=(",", ":"), default=str)
        return "octo-semantic-cache:" + hash_cache_key(canonical)

    def _safe_prompt(self, req: ChatCompletionRequest) -> bool:
        safe, _ = is_safe_for_cache(
            json.dumps([m.model_dump(exclude_none=True) for m in req.messages], sort_keys=True, default=str)
        )
        return safe

    async def lookup(self, req: ChatCompletionRequest) -> ChatCompletionResponse | None:
        if req.tools or not self._safe_prompt(req):
            return None
        return self._local.get(self._key(req))

    async def store(self, req: ChatCompletionRequest, res: ChatCompletionResponse) -> None:
        if req.tools or not self._safe_prompt(req):
            return
        self._local[self._key(req)] = res
