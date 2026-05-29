"""Canonical runtime execution schemas.

These models are the single Python runtime contract used by:

- POST /api/v1/execute
- ExecutionService
- f1_runtime result adaptation

Cross-language TS/Python drift is intentionally handled by issue #145.
Until that is closed, this file must not be treated as proof that contract
sync is solved.
"""
from __future__ import annotations

from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class OctoModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class ExecutionStatus(StrEnum):
    PENDING = "pending"
    QUEUED = "queued"
    DISPATCHED = "dispatched"
    RUNNING = "running"
    WAITING_TOOL = "waiting_tool"
    WAITING_HUMAN = "waiting_human"
    RETRYING = "retrying"
    RETRY_SCHEDULED = "retry_scheduled"
    SUSPENDED = "suspended"
    RECLAIMABLE = "reclaimable"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class LLMConfigSchema(OctoModel):
    primary: str = "litellm/default"
    fallback: list[str] = Field(default_factory=list)
    temperature: float = Field(default=0.7, ge=0.0, le=2.0)
    max_tokens: int | None = Field(default=None, ge=1)
    policy_ref: str | None = None
    provider: str | None = None


class ExecutionLimitsSchema(OctoModel):
    max_usd_per_run: float | None = Field(default=None, ge=0)
    max_tokens_per_run: int | None = Field(default=None, ge=1)
    max_tool_rounds_per_run: int | None = Field(default=None, ge=1)
    max_delegation_depth: int | None = Field(default=None, ge=0)
    max_concurrent_runs: int | None = Field(default=None, ge=1)
    run_timeout_secs: int | None = Field(default=300, ge=30)


class ExecutionRequest(OctoModel):
    execution_id: str
    tenant_id: str
    agent_id: str
    workspace_id: str = "default"
    task: str = Field(default="execute persisted task", min_length=1, max_length=32_000)
    context: dict[str, Any] = Field(default_factory=dict)
    llm: LLMConfigSchema = Field(default_factory=LLMConfigSchema)
    limits: ExecutionLimitsSchema = Field(default_factory=ExecutionLimitsSchema)
    tools: list[str] = Field(default_factory=list)
    streaming: bool = False
    trace_id: str
    run_id: str = ""


class ExecutionResult(OctoModel):
    execution_id: str
    status: ExecutionStatus
    output: str | None = None
    tool_calls: list[dict[str, Any]] = Field(default_factory=list)
    usage: dict[str, int] = Field(default_factory=dict)
    error: str | None = None
    duration_ms: int = Field(ge=0)
    checkpoint: dict[str, Any] | None = None
