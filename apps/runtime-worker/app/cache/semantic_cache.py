from __future__ import annotations

from typing import Protocol

from app.contracts.llm import ChatCompletionRequest, ChatCompletionResponse


class SemanticPromptCache(Protocol):
    async def lookup(self, req: ChatCompletionRequest) -> ChatCompletionResponse | None: ...

    async def store(self, req: ChatCompletionRequest, res: ChatCompletionResponse) -> None: ...
