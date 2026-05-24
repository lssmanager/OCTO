from __future__ import annotations

import hashlib
from decimal import Decimal
from typing import Any

from app.accounting.models import (
    BudgetEvaluationResult,
    LLMUsageRecord,
    LLMStepAccounting,
    PromptCacheAccounting,
    ReasoningAccounting,
    RoutingAccounting,
    StructuredOutputAccounting,
)
from app.contracts.llm import ChatCompletionRequest, ChatCompletionResponse


class TokenAccountingService:
    def build_from_response(
        self,
        *,
        req: ChatCompletionRequest,
        response: ChatCompletionResponse,
        latency_ms: int,
        step_id: str,
        step_index: int,
        budget_snapshot_json: dict[str, Any],
        budget_before: BudgetEvaluationResult,
    ) -> LLMStepAccounting:
        cache_key_hash = None
        if req.prompt_cache and req.prompt_cache.cache_key:
            cache_key_hash = hashlib.sha256(req.prompt_cache.cache_key.encode("utf-8")).hexdigest()

        prompt_cache = PromptCacheAccounting(
            enabled=bool(req.prompt_cache and req.prompt_cache.enabled),
            provider_cache_used=bool(req.prompt_cache and req.prompt_cache.enabled),
            cache_key_hash=cache_key_hash,
            cached_input_tokens=response.usage.cached_input_tokens,
            cache_hit=response.usage.cached_input_tokens > 0,
        )
        reasoning = ReasoningAccounting(
            enabled=req.reasoning_effort != "none",
            reasoning_effort=req.reasoning_effort,
            reasoning_tokens=response.usage.reasoning_tokens,
            hidden_reasoning_tokens=response.usage.reasoning_tokens,
        )
        structured_output = StructuredOutputAccounting(
            enabled=req.output_schema is not None,
            validation_status="provider_enforced" if req.output_schema is not None else "not_applicable",
            schema_hash=("sha256:" + hashlib.sha256(str(req.output_schema).encode("utf-8")).hexdigest()[:12]) if req.output_schema is not None else None,
        )
        routing = RoutingAccounting(
            routing_strategy=req.routing_strategy,
            primary_model=req.model,
            selected_model=response.usage.model,
            selected_provider=response.usage.provider,
            attempted_models=[req.model],
        )

        usage = LLMUsageRecord(
            provider=response.usage.provider,
            model=response.usage.model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
            total_tokens=response.usage.total_tokens,
            estimated_cost_usd=Decimal(str(response.usage.estimated_cost_usd)),
            latency_ms=latency_ms,
            finish_reason=response.finish_reason,
            prompt_cache=prompt_cache,
            reasoning=reasoning,
            structured_output=structured_output,
            routing=routing,
            accounting_error=False,
        )
        return LLMStepAccounting(
            tenant_id=req.tenant_id,
            execution_id=req.execution_id,
            agent_id=req.agent_id,
            step_id=step_id,
            step_index=step_index,
            trace_id=(req.metadata or {}).get("trace_id"),
            llm_call=usage,
            budget_snapshot_json=budget_snapshot_json,
            budget_evaluation_before=budget_before,
        )
