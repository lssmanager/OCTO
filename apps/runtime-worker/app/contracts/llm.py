from __future__ import annotations

from decimal import Decimal
from typing import Any, AsyncIterator, Literal, Protocol

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


class PromptCachePolicy(BaseModel):
    enabled: bool = False
    strategy: Literal["none", "provider", "semantic", "provider_then_semantic"] = "none"
    cache_key: str | None = None
    provider_breakpoints: list[int] | None = None
    semantic_similarity_threshold: float = 0.92
    ttl_seconds: int | None = None


class ChatCompletionRequest(BaseModel):
    tenant_id: str
    execution_id: str
    agent_id: str
    model: str
    messages: list[CanonicalChatMessage]
    temperature: float = 0.2
    max_output_tokens: int = 2048
    stream: bool = False
    timeout_ms: int = 90_000
    tools: list[CanonicalToolDefinition] | None = None
    tool_choice: Literal["none", "auto", "required"] = "auto"
    provider_params: dict[str, Any] | None = None
    metadata: dict[str, str] | None = None
    prompt_cache: PromptCachePolicy | None = None
    reasoning_effort: Literal["none", "low", "medium", "high"] = "none"
    output_schema: dict[str, Any] | None = None
    routing_strategy: Literal["default", "least-busy", "latency-based", "cost-based"] = "default"


class ChatUsage(BaseModel):
    input_tokens: int = Field(default=0, ge=0)
    output_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)
    reasoning_tokens: int = Field(default=0, ge=0)
    cached_input_tokens: int = Field(default=0, ge=0)
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


class StreamDelta(BaseModel):
    type: Literal["delta", "reasoning_delta", "tool_call_delta", "done", "error"]
    content: str | None = None
    reasoning_content: str | None = None
    tool_call_delta: dict[str, Any] | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class ILLMProvider(Protocol):
    async def chat(self, req: ChatCompletionRequest) -> ChatCompletionResponse: ...

    async def stream(self, req: ChatCompletionRequest) -> AsyncIterator[StreamDelta]: ...
