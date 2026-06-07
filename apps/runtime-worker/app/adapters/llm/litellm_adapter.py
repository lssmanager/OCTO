from __future__ import annotations

import json
import time
from decimal import Decimal
from typing import Any, AsyncIterator

from app.adapters.llm.base import LLMCanonicalError
from app.adapters.llm.error_mapper import map_http_error
from app.adapters.llm.prompt_cache import apply_prompt_cache
from app.adapters.llm.provider_params import allowlisted_provider_params, canonical_model_identifier, resolve_provider
from app.contracts.llm import ChatCompletionRequest, ChatCompletionResponse, ChatUsage, ILLMProvider, StreamDelta

try:
    from openai import APIConnectionError, APIError, APITimeoutError, AsyncOpenAI, BadRequestError, AuthenticationError, RateLimitError
except Exception:  # pragma: no cover
    APIConnectionError = Exception  # type: ignore[assignment]
    APIError = Exception  # type: ignore[assignment]
    APITimeoutError = TimeoutError  # type: ignore[assignment]
    BadRequestError = Exception  # type: ignore[assignment]
    AuthenticationError = Exception  # type: ignore[assignment]
    RateLimitError = Exception  # type: ignore[assignment]
    AsyncOpenAI = None  # type: ignore[assignment]


class LiteLLMAdapter(ILLMProvider):
    def __init__(self, proxy_url: str, proxy_api_key: str, metrics: Any | None = None, logger: Any | None = None, circuit_registry: Any | None = None, rate_limiter: Any | None = None) -> None:
        if AsyncOpenAI is None:
            raise RuntimeError("openai package is required for LiteLLMAdapter")
        self.client = AsyncOpenAI(base_url=f"{proxy_url.rstrip('/')}/v1", api_key=proxy_api_key, max_retries=0)
        self.metrics = metrics
        self.logger = logger
        self.circuit_registry = circuit_registry
        self.rate_limiter = rate_limiter

    def _build_payload(self, req: ChatCompletionRequest) -> dict[str, Any]:
        effective_model = canonical_model_identifier(req.model)
        provider = resolve_provider(effective_model)
        payload: dict[str, Any] = {
            "model": effective_model,
            "messages": [m.model_dump(exclude_none=True) for m in req.messages],
            "stream": req.stream,
            "timeout": req.timeout_ms / 1000,
            "max_tokens": req.max_output_tokens,
            "temperature": req.temperature,
            "metadata": {
                "tenant_id": req.tenant_id,
                "execution_id": req.execution_id,
                "agent_id": req.agent_id,
                "trace_id": (req.metadata or {}).get("trace_id"),
                "routing_strategy": req.routing_strategy,
            },
        }
        if req.tool_choice == "required" and not req.tools:
            raise LLMCanonicalError("LLM_BAD_REQUEST", "tool_choice=required needs tools", False, model=effective_model)
        if req.tools and req.tool_choice != "none":
            payload["tools"] = [{"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.input_schema}} for t in req.tools]
            payload["tool_choice"] = req.tool_choice

        if req.output_schema is not None:
            payload["response_format"] = {"type": "json_schema", "json_schema": {"name": "octo_structured_output", "schema": req.output_schema, "strict": True}}

        if req.reasoning_effort != "none":
            if provider in {"openai", "deepseek"}:
                payload["reasoning_effort"] = req.reasoning_effort
            elif provider == "anthropic":
                payload["thinking"] = {"type": "enabled", "budget_tokens": 1024}
            elif provider == "gemini":
                payload["thinking_config"] = {"thinking_budget": 1024}

        payload.update(allowlisted_provider_params(effective_model, req.provider_params))
        apply_prompt_cache(req, provider, payload)
        return {k: v for k, v in payload.items() if v is not None}

    def _normalize(self, req: ChatCompletionRequest, raw: Any) -> ChatCompletionResponse:
        usage = getattr(raw, "usage", None)
        choice = raw.choices[0]
        message = choice.message
        tool_calls = None
        if message.tool_calls:
            tool_calls = [
                {"id": tc.id, "name": tc.function.name, "arguments_json": tc.function.arguments}
                for tc in message.tool_calls
            ]
        hidden = getattr(raw, "_hidden_params", {})
        usage_dict = usage.model_dump() if usage else {}
        reasoning_tokens = int(usage_dict.get("completion_tokens_details", {}).get("reasoning_tokens", 0) or 0)
        cached_input_tokens = int(usage_dict.get("prompt_tokens_details", {}).get("cached_tokens", 0) or 0)
        finish = choice.finish_reason if choice.finish_reason in {"stop", "tool_calls", "length", "content_filter"} else "error"
        provider = resolve_provider(canonical_model_identifier(req.model))
        return ChatCompletionResponse(
            id=raw.id,
            content=message.content or "",
            tool_calls=tool_calls,
            finish_reason=finish,
            usage=ChatUsage(
                input_tokens=int(getattr(usage, "prompt_tokens", 0) or 0),
                output_tokens=int(getattr(usage, "completion_tokens", 0) or 0),
                total_tokens=int(getattr(usage, "total_tokens", 0) or 0),
                reasoning_tokens=reasoning_tokens,
                cached_input_tokens=cached_input_tokens,
                provider=provider,
                model=getattr(raw, "model", req.model),
                estimated_cost_usd=Decimal(str(hidden.get("response_cost", "0"))),
            ),
            raw=raw.model_dump(),
        )

    async def chat(self, req: ChatCompletionRequest) -> ChatCompletionResponse:
        effective_model = canonical_model_identifier(req.model)
        provider = resolve_provider(effective_model)
        start = time.perf_counter()
        try:
            if self.circuit_registry is not None:
                cb = self.circuit_registry.get(req.tenant_id, provider, effective_model)
                if not await cb.can_attempt():
                    raise LLMCanonicalError("LLM_CIRCUIT_OPEN", "circuit open", True, provider=provider, model=effective_model)
            if self.rate_limiter is not None:
                allowed = await self.rate_limiter.acquire(req.tenant_id, effective_model, max(1, req.max_output_tokens), 100000, 1000.0)
                if not allowed:
                    raise LLMCanonicalError("LLM_RATE_LIMITED", "local rate limiter", True, provider=provider, model=effective_model)
            payload = self._build_payload(req)
            raw = await self.client.chat.completions.create(**payload)
            res = self._normalize(req, raw)
            if req.output_schema is not None and req.tool_choice == "none":
                try:
                    json.loads(res.content or "{}")
                except Exception as exc:
                    raise LLMCanonicalError("LLM_STRUCTURED_OUTPUT_INVALID", "invalid json output", False, provider=provider, model=effective_model) from exc
            if self.circuit_registry is not None:
                await self.circuit_registry.get(req.tenant_id, provider, effective_model).record_success()
            self._emit("success", provider, effective_model, res, int((time.perf_counter() - start) * 1000), None)
            return res
        except (RateLimitError,) as exc:
            err = LLMCanonicalError("LLM_RATE_LIMITED", str(exc), True, provider=provider, model=effective_model, raw_error_type=type(exc).__name__)
        except (APITimeoutError,) as exc:
            err = LLMCanonicalError("LLM_TIMEOUT", str(exc), True, provider=provider, model=effective_model, raw_error_type=type(exc).__name__)
        except (APIConnectionError,) as exc:
            err = LLMCanonicalError("LLM_PROVIDER_UNAVAILABLE", str(exc), True, provider=provider, model=effective_model, raw_error_type=type(exc).__name__)
        except (AuthenticationError,) as exc:
            err = LLMCanonicalError("LLM_PROVIDER_AUTH_FAILED", str(exc), False, provider=provider, model=effective_model, raw_error_type=type(exc).__name__)
        except (BadRequestError,) as exc:
            err = LLMCanonicalError("LLM_BAD_REQUEST", str(exc), False, provider=provider, model=effective_model, raw_error_type=type(exc).__name__)
        except APIError as exc:
            err = map_http_error(getattr(exc, "status_code", 500) or 500, str(exc), provider=provider, model=effective_model)
        except LLMCanonicalError as exc:
            err = exc
        if self.circuit_registry is not None:
            await self.circuit_registry.get(req.tenant_id, provider, effective_model).record_failure(getattr(err, "canonical_code", "ERR"), getattr(err, "retryable", False))
        self._emit("error", provider, effective_model, None, int((time.perf_counter() - start) * 1000), err)
        raise err

    async def stream(self, req: ChatCompletionRequest) -> AsyncIterator[StreamDelta]:
        payload = self._build_payload(req)
        payload["stream"] = True
        async with self.client.chat.completions.stream(**payload) as stream:
            async for event in stream:
                chunk = event.model_dump()
                delta = (((chunk.get("choices") or [{}])[0].get("delta") or {}))
                if "content" in delta and delta["content"]:
                    yield StreamDelta(type="delta", content=delta["content"])
                if "reasoning" in delta and delta["reasoning"]:
                    yield StreamDelta(type="reasoning_delta", reasoning_content=str(delta["reasoning"]))
                if "tool_calls" in delta and delta["tool_calls"]:
                    yield StreamDelta(type="tool_call_delta", tool_call_delta={"tool_calls": delta["tool_calls"]})
            yield StreamDelta(type="done")

    def _emit(self, status: str, provider: str, model: str, res: ChatCompletionResponse | None, latency_ms: int, err: LLMCanonicalError | None) -> None:
        if self.metrics is not None:
            self.metrics.increment("octo_litellm_request_total", {"provider": provider, "model": model, "status": status})
        if self.logger is not None:
            self.logger.info("llm.call", extra={"provider": provider, "model": model, "status": status, "latency_ms": latency_ms, "finish_reason": getattr(res, 'finish_reason', None), "error_code": getattr(err, 'canonical_code', None)})
