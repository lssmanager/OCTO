from __future__ import annotations

import json

from app.cache.cache_key import hash_cache_key
from app.cache.cache_safety import is_safe_for_cache
from app.contracts.llm import ChatCompletionRequest, ChatCompletionResponse


class QdrantSemanticCache:
    def __init__(self, backend: object | None = None) -> None:
        self.backend = backend
        self._local: dict[str, ChatCompletionResponse] = {}

    def _key(self, req: ChatCompletionRequest) -> str:
        fingerprint = {
            "tenant_id": req.tenant_id,
            "agent_id": req.agent_id,
            "model": req.model,
            "tool_choice": req.tool_choice,
            "reasoning_effort": req.reasoning_effort,
            "output_schema": req.output_schema,
            "messages": [
                {"role": m.role, "content": m.content, "name": m.name, "tool_call_id": m.tool_call_id}
                for m in req.messages
                if m.role in {"system", "user"}
            ],
        }
        return hash_cache_key(json.dumps(fingerprint, sort_keys=True, separators=(",", ":")))

    async def lookup(self, req: ChatCompletionRequest) -> ChatCompletionResponse | None:
        if req.tools:
            return None
        safe, _ = is_safe_for_cache(
            json.dumps(
                [{"role": m.role, "content": m.content} for m in req.messages],
                sort_keys=True,
                default=str,
            )
        )
        if not safe:
            return None
        return self._local.get(self._key(req))

    async def store(self, req: ChatCompletionRequest, res: ChatCompletionResponse) -> None:
        if req.tools:
            return
        safe, _ = is_safe_for_cache(
            json.dumps(
                [{"role": m.role, "content": m.content} for m in req.messages],
                sort_keys=True,
                default=str,
            )
        )
        if not safe:
            return
        self._local[self._key(req)] = res
