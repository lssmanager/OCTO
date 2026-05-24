from __future__ import annotations

from abc import ABC, abstractmethod
from decimal import Decimal
from typing import Any, AsyncIterable, Literal

from pydantic import BaseModel, Field


class CanonicalChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | list[dict[str, Any]]
    name: str | None = None
    tool_call_id: str | None = None


class CanonicalToolDefinition(BaseModel):
    name: str
    description: str
    input_schema: dict[str, Any]


class ChatCompletionRequest(BaseModel):
    tenant_id: str
    execution_id: str
    agent_id: str
    model: str
    temperature: float = 0.2
    max_output_tokens: int = 2048
    stream: bool = False
    timeout_ms: int = 90_000
    messages: list[CanonicalChatMessage]
    tools: list[CanonicalToolDefinition] | None = None
    provider_params: dict[str, Any] | None = None
    metadata: dict[str, str] | None = None


class ChatUsage(BaseModel):
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)
    provider: str
    model: str
    estimated_cost_usd: Decimal


class ChatCompletionResponse(BaseModel):
    id: str
    content: str
    tool_calls: list[dict[str, Any]] | None = None
    finish_reason: Literal["stop", "tool_calls", "length", "content_filter", "error"]
    usage: ChatUsage
    raw: dict[str, Any]


class LLMProvider(ABC):
    @abstractmethod
    async def chat(self, req: ChatCompletionRequest) -> ChatCompletionResponse:
        raise NotImplementedError

    @abstractmethod
    async def stream(self, req: ChatCompletionRequest) -> AsyncIterable[dict[str, Any]]:
        raise NotImplementedError
