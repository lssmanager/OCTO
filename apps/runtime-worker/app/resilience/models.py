from __future__ import annotations

from decimal import Decimal
from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class CircuitBreakerState(str, Enum):
    CLOSED = "CLOSED"
    OPEN = "OPEN"
    HALF_OPEN = "HALF_OPEN"


class CircuitBreakerConfig(BaseModel):
    failure_threshold: int = 5
    window_seconds: int = 60
    recovery_timeout_seconds: int = 30
    half_open_probe_count: int = 1


class ModelCapabilityRequirements(BaseModel):
    requires_tools: bool = False
    requires_structured_output: bool = False
    requires_native_json_schema: bool = False
    requires_reasoning: bool = False
    reasoning_effort: Literal["none", "low", "medium", "high"] = "none"
    requires_prompt_cache: bool = False
    allow_provider_prompt_cache_fallback: bool = True


class ModelCandidate(BaseModel):
    model: str
    provider: str
    source_level: Literal["agent", "workspace", "department", "agency", "global"]
    priority: int
    supports_tools: bool = True
    supports_structured_output: bool = False
    supports_native_json_schema: bool = False
    supports_reasoning: bool = False
    supports_prompt_cache: bool = False
    estimated_cost_usd_per_1k_input: Decimal | None = None
    observed_latency_ms_p50: int | None = None
    recent_error_rate: float | None = None
    cache_affinity_score: float = 0.0


class RoutingStrategy(str, Enum):
    DEFAULT = "default"
    LEAST_BUSY = "least-busy"
    LATENCY_BASED = "latency-based"
    COST_BASED = "cost-based"


class RoutingDecision(BaseModel):
    selected_model: str
    selected_provider: str
    routing_strategy: RoutingStrategy
    routing_reason: str
    primary_model: str
    attempted_models: list[str] = Field(default_factory=list)
    skipped_models: list[dict[str, Any]] = Field(default_factory=list)
    fallback_level: int = 0
    retry_count: int = 0
    circuit_states: dict[str, CircuitBreakerState] = Field(default_factory=dict)


class ResilienceAttemptMetadata(BaseModel):
    model: str
    provider: str
    attempt_index: int
    fallback_level: int
    retry_count: int
    circuit_state_before: CircuitBreakerState
    rate_limit_allowed: bool
    budget_allowed: bool
    started_at: str
    completed_at: str | None = None
    status: Literal["success", "failed", "skipped"] = "skipped"
    error_code: str | None = None
