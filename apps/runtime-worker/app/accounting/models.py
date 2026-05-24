from __future__ import annotations

from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, Field


class BudgetPolicySnapshot(BaseModel):
    max_usd_per_run: Decimal | None = None
    min_reserved_cost_usd: Decimal = Decimal("0.000001")
    on_exhaust: Literal["fail", "pause_for_approval"] = "fail"
    snapshot_version: int = 1


class PromptCacheAccounting(BaseModel):
    enabled: bool = False
    provider_cache_used: bool = False
    semantic_cache_used: bool = False
    cache_key_hash: str | None = None
    cache_hit: bool = False
    cache_read_tokens: int = 0
    cache_write_tokens: int = 0
    cached_input_tokens: int = 0
    estimated_cache_savings_usd: Decimal = Decimal("0")


class ReasoningAccounting(BaseModel):
    enabled: bool = False
    reasoning_effort: Literal["none", "low", "medium", "high"] = "none"
    reasoning_tokens: int = 0
    visible_reasoning_tokens: int = 0
    hidden_reasoning_tokens: int = 0
    reasoning_cost_usd: Decimal = Decimal("0")


class StructuredOutputAccounting(BaseModel):
    enabled: bool = False
    schema_hash: str | None = None
    strict: bool = True
    validation_status: Literal["not_applicable", "valid", "invalid", "provider_enforced", "local_fallback_valid", "local_fallback_invalid"] = "not_applicable"
    repair_attempts: int = 0
    validation_error_code: str | None = None


class RoutingAccounting(BaseModel):
    routing_strategy: Literal["default", "least-busy", "latency-based", "cost-based"] = "default"
    primary_model: str
    selected_model: str
    selected_provider: str
    fallback_level: int = 0
    retry_count: int = 0
    attempted_models: list[str] = Field(default_factory=list)


class LLMUsageRecord(BaseModel):
    provider: str
    model: str
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)
    total_tokens: int = Field(ge=0)
    estimated_cost_usd: Decimal = Decimal("0")
    latency_ms: int = Field(ge=0)
    finish_reason: str | None = None
    prompt_cache: PromptCacheAccounting = Field(default_factory=PromptCacheAccounting)
    reasoning: ReasoningAccounting = Field(default_factory=ReasoningAccounting)
    structured_output: StructuredOutputAccounting = Field(default_factory=StructuredOutputAccounting)
    routing: RoutingAccounting
    accounting_error: bool = False
    accounting_error_reason: str | None = None


class ExecutionUsageAggregate(BaseModel):
    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    reasoning_tokens: int = 0
    cached_input_tokens: int = 0
    estimated_cost_usd: Decimal = Decimal("0")


class BudgetEvaluationResult(BaseModel):
    allowed: bool
    outcome: Literal["allow", "fail", "pause_for_approval"]
    reason: str
    remaining_budget_usd: Decimal | None = None
    projected_cost_usd: Decimal | None = None
    current_spend_usd: Decimal = Decimal("0")


class LLMStepAccounting(BaseModel):
    tenant_id: str
    execution_id: str
    agent_id: str
    step_id: str
    step_index: int
    trace_id: str | None = None
    llm_call: LLMUsageRecord
    budget_snapshot_json: dict[str, Any]
    budget_evaluation_before: BudgetEvaluationResult
    budget_evaluation_after: BudgetEvaluationResult | None = None
    schema_version: int = 1
