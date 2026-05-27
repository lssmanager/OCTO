"""Pydantic v2 schemas that mirror @octo/contracts TypeScript interfaces.

Convention (F0-002):
  - TypeScript interface `IFoo`          → Python class `Foo` (Pydantic BaseModel)
  - TypeScript `type FooStatus = ...`    → Python `FooStatus = Literal[...]`
  - Field names: camelCase in TS → snake_case in Python (alias_generator bridges)
  - These models are NOT auto-generated. They are kept in sync by convention.
    A JSON Schema round-trip test will be added in F1 to catch drift.
"""
from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class OctoModel(BaseModel):
    """Base model: camelCase JSON I/O, strict validation, no extra fields."""

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


# ---------------------------------------------------------------------------
# Execution contracts (mirrors contracts/src/execution.ts)
# ---------------------------------------------------------------------------

class ExecutionStatus(StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    RUNNING = "running"
    WAITING_TOOL = "waiting_tool"
    WAITING_HUMAN = "waiting_human"
    RETRYING = "retrying"
    SUSPENDED = "suspended"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class LLMConfigSchema(OctoModel):
    """Mirrors LLMConfig in @octo/contracts."""

    primary: str
    fallback: list[str] = Field(default_factory=list)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1)
    policy_ref: str | None = None
    provider: str | None = None


class ExecutionLimitsSchema(OctoModel):
    """Mirrors ExecutionLimits in @octo/contracts."""

    max_usd_per_run: float | None = Field(default=None, ge=0)
    max_tokens_per_run: int | None = Field(default=None, ge=1)
    max_tool_rounds_per_run: int | None = Field(default=None, ge=1)
    max_delegation_depth: int | None = Field(default=None, ge=0)
    max_concurrent_runs: int | None = Field(default=None, ge=1)
    run_timeout_secs: int | None = Field(default=300, ge=30)


class ExecutionRequest(OctoModel):
    """Inbound job payload from the Control Plane.

    trace_id and run_id are REQUIRED for OTEL propagation (F0-002).
    Every log entry and span in the worker must carry these two values.
    """

    execution_id: str = Field(description="UUIDv7 assigned by the Control Plane")
    tenant_id: str | None = Field(default=None, description="Tenant boundary for runtime durable transitions")
    agent_id: str
    workspace_id: str
    task: str = Field(min_length=1, max_length=32_000)
    context: dict[str, Any] = Field(default_factory=dict)
    llm: LLMConfigSchema
    limits: ExecutionLimitsSchema = Field(default_factory=ExecutionLimitsSchema)
    tools: list[str] = Field(default_factory=list, description="Tool IDs to activate")
    streaming: bool = Field(default=False)
    # OTEL propagation — mandatory, no default (F0-002 contract)
    trace_id: str = Field(description="OTEL trace_id, propagated to all spans and logs")
    run_id: str = Field(description="Monotonic run counter for this execution")


class ExecutionResult(OctoModel):
    """Response returned to the Control Plane after execution."""

    execution_id: str
    status: ExecutionStatus
    output: str | None = None
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    usage: dict[str, int] = Field(default_factory=dict, description="Token usage stats")
    error: str | None = None
    duration_ms: int = Field(ge=0)
    checkpoint: dict[str, Any] | None = Field(
        default=None,
        description="LangGraph pause/resume state — populated in F2",
    )


# ---------------------------------------------------------------------------
# Health schemas
# ---------------------------------------------------------------------------

class DependencyStatus(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"
    DOWN = "down"


class HealthDetail(OctoModel):
    name: str
    status: DependencyStatus
    latency_ms: int | None = None
    error: str | None = None


class HealthResponse(OctoModel):
    """Full health status including phase marker (F0, F1, F2 ...)."""

    status: DependencyStatus
    version: str
    service: str
    # phase identifies which platform milestone this build belongs to.
    # Required by issue #10: GET /health must return {phase: "F0"}.
    phase: str = Field(default="F0", description="Platform phase (F0, F1, F2 ...)")
    checks: list[HealthDetail] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Model listing schema
# ---------------------------------------------------------------------------

class ModelInfo(OctoModel):
    id: str
    provider: str
    context_window: int | None = None
    supports_function_calling: bool = False
    supports_streaming: bool = True
