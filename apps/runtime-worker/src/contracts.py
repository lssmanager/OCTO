# apps/runtime-worker/src/contracts.py
# Mirror de @octo/contracts para el runtime Python.
#
# REGLAS DE SINCRONIZACIÓN:
#   - Cambio en TS → actualizar Python en el MISMO commit
#   - camelCase TS  → snake_case Python
#   - Record<string, unknown> TS → dict[str, Any] Python
#   - string literal union TS  → Literal[...] Python
#   - optional field TS        → Optional[...] Python
#
# Ref: F0-008 (CrewAI), F0-009 (Hermes), F0-010 (Paperclip)
# Generación automática planificada en F2+.

from __future__ import annotations

from typing import Any, Literal, Optional

from pydantic import BaseModel, Field


class OctoModel(BaseModel):
    """Base model compartido. Prohíbe campos extra para detectar drift con TS."""

    model_config = {"populate_by_name": True, "extra": "forbid"}


# ─── GOVERNANCE POLICY ────────────────────────────────────────────────────────
# Mirror de GovernancePolicy en execution.ts (value object).
# Paperclip pattern: obligatorio en toda ExecutionRequest.


class GovernancePolicy(OctoModel):
    """Value object de gobernanza. Viaja en cada ExecutionRequest."""

    token_budget: int = Field(..., gt=0, description="Paperclip: hard token limit")
    max_iterations: int = Field(default=25, ge=1, le=100, description="CrewAI: max_iter")
    max_delegation_depth: int = Field(default=3, ge=0, le=10)
    allowed_tools: list[str] = Field(default_factory=list)
    require_approval: bool = False
    timeout_ms: int = Field(default=30_000, gt=0)


# ─── TASK DEFINITION ─────────────────────────────────────────────────────────


class TaskDefinition(OctoModel):
    id: str
    type: str
    input: dict[str, Any]
    expected_output_schema: Optional[dict[str, Any]] = None  # CrewAI: expected_output
    timeout: Optional[int] = None


# ─── EXECUTION CONTEXT ────────────────────────────────────────────────────────


class ExecutionContext(OctoModel):
    parent_execution_id: Optional[str] = None
    delegation_chain: list[str] = Field(default_factory=list)  # Hermes pattern
    memory_scope: str = "default"
    variables: dict[str, Any] = Field(default_factory=dict)


# ─── EXECUTION REQUEST ────────────────────────────────────────────────────────
# Contrato principal que llega al worker desde BullMQ.


class ExecutionRequest(OctoModel):
    """Contrato API → Queue → Worker. governance y trace_id son OBLIGATORIOS."""

    agent_id: str
    task: TaskDefinition
    governance: GovernancePolicy  # Paperclip: obligatorio, no Optional
    trace_id: str  # OTEL: propagado a todos los spans de esta ejecución
    context: Optional[ExecutionContext] = None


# ─── TASK RESULT ─────────────────────────────────────────────────────────────


class TaskResult(OctoModel):
    output: Any
    output_type: str
    confidence: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    sources: list[str] = Field(default_factory=list)


# ─── TOKEN USAGE ─────────────────────────────────────────────────────────────


class TokenUsage(OctoModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0
    total_tokens: int = 0
    estimated_cost_usd: Optional[float] = None


# ─── EXECUTION STATUS ────────────────────────────────────────────────────────

ExecutionStatus = Literal[
    "pending",
    "queued",
    "running",
    "paused",
    "awaiting_approval",
    "completed",
    "failed",
    "cancelled",
]


# ─── EXECUTION ERROR ─────────────────────────────────────────────────────────


class ExecutionError(OctoModel):
    code: str
    message: str
    retryable: bool
    details: Optional[dict[str, Any]] = None


# ─── EXECUTION RESPONSE (Worker → API) ───────────────────────────────────────


class ExecutionResponse(OctoModel):
    """Respuesta del worker al finalizar o fallar una ejecución."""

    execution_id: str
    status: ExecutionStatus
    result: Optional[TaskResult] = None
    error: Optional[ExecutionError] = None
    token_usage: Optional[TokenUsage] = None
    duration_ms: Optional[int] = None
