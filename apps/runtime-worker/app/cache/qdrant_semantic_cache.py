from __future__ import annotations

from app.cache.cache_key import hash_cache_key
from app.cache.cache_safety import is_safe_for_cache
from app.contracts.llm import ChatCompletionRequest, ChatCompletionResponse


class QdrantSemanticCache:
    def __init__(self, backend: object | None = None) -> None:
        self.backend = backend
        self._local: dict[str, ChatCompletionResponse] = {}

    def _key(self, req: ChatCompletionRequest) -> str:
        stable = "|".join(str(m.content)[:128] for m in req.messages if m.role in {"system", "user"})
        return hash_cache_key(f"{req.tenant_id}:{req.agent_id}:{req.model}:{stable}")

    async def lookup(self, req: ChatCompletionRequest) -> ChatCompletionResponse | None:
        if req.tools:
            return None
        safe, _ = is_safe_for_cache(" ".join(str(m.content) for m in req.messages))
        if not safe:
            return None
        return self._local.get(self._key(req))

    async def store(self, req: ChatCompletionRequest, res: ChatCompletionResponse) -> None:
        if req.tools:
            return
        safe, _ = is_safe_for_cache(" ".join(str(m.content) for m in req.messages))
        if not safe:
            return
        self._local[self._key(req)] = res
