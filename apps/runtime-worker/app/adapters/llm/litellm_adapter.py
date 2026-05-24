from __future__ import annotations

from decimal import Decimal
from typing import Any, AsyncIterable

from app.adapters.llm.base import LLMCanonicalError
from app.adapters.llm.error_mapper import map_http_error
from app.adapters.llm.provider_params import allowlisted_provider_params
from app.contracts.llm import ChatCompletionRequest, ChatCompletionResponse, ChatUsage, LLMProvider

try:
    from openai import AsyncOpenAI
    from openai import APIError, APITimeoutError
except Exception:  # pragma: no cover
    AsyncOpenAI = None  # type: ignore[assignment]
    APIError = Exception  # type: ignore[assignment]
    APITimeoutError = TimeoutError  # type: ignore[assignment]


class LiteLLMAdapter(LLMProvider):
    def __init__(self, proxy_url: str, proxy_api_key: str, redis_client: Any, config: dict[str, Any] | None = None) -> None:
        if AsyncOpenAI is None:
            raise RuntimeError("openai package is required for LiteLLMAdapter")
        self.redis_client = redis_client
        self.config = config or {}
        self.client = AsyncOpenAI(base_url=f"{proxy_url.rstrip('/')}/v1", api_key=proxy_api_key, max_retries=0)

    async def chat(self, req: ChatCompletionRequest) -> ChatCompletionResponse:
        headers = {
            "x-tenant-id": req.tenant_id,
            "x-execution-id": req.execution_id,
            "x-agent-id": req.agent_id,
        }
        if req.metadata and "trace_id" in req.metadata:
            headers["x-trace-id"] = req.metadata["trace_id"]
        payload: dict[str, Any] = {
            "model": req.model,
            "messages": [m.model_dump(exclude_none=True) for m in req.messages],
            "temperature": req.temperature,
            "max_tokens": req.max_output_tokens,
            **allowlisted_provider_params(req.provider_params),
        }
        if req.tools:
            payload["tools"] = [
                {"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.input_schema}}
                for t in req.tools
            ]
        try:
            response = await self.client.chat.completions.create(**payload, timeout=req.timeout_ms / 1000, extra_headers=headers)
        except APITimeoutError as exc:
            raise LLMCanonicalError("LLM_TIMEOUT", str(exc), True, model=req.model) from exc
        except APIError as exc:
            status_code = getattr(exc, "status_code", 500)
            raise map_http_error(status_code, str(exc), model=req.model) from exc

        usage = getattr(response, "usage", None)
        if usage is None:
            raise LLMCanonicalError("LLM_EMPTY_RESPONSE", "missing usage", True, model=req.model)
        choice = response.choices[0]
        message = choice.message
        content = message.content or ""
        provider = req.model.split("/", 1)[0] if "/" in req.model else "unknown"
        return ChatCompletionResponse(
            id=response.id,
            content=content,
            tool_calls=[tc.model_dump() for tc in (message.tool_calls or [])] or None,
            finish_reason=choice.finish_reason if choice.finish_reason in {"stop", "tool_calls", "length", "content_filter"} else "error",
            usage=ChatUsage(
                input_tokens=usage.prompt_tokens,
                output_tokens=usage.completion_tokens,
                total_tokens=usage.total_tokens,
                provider=provider,
                model=response.model,
                estimated_cost_usd=Decimal(str(getattr(response, "_hidden_params", {}).get("response_cost", "0"))),
            ),
            raw=response.model_dump(),
        )

    async def stream(self, req: ChatCompletionRequest) -> AsyncIterable[dict[str, Any]]:
        payload = {
            "model": req.model,
            "messages": [m.model_dump(exclude_none=True) for m in req.messages],
            "stream": True,
        }
        async with self.client.chat.completions.stream(**payload, timeout=req.timeout_ms / 1000) as stream:
            async for event in stream:
                yield event.model_dump()
