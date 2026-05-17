"""Execution contracts — espejo de @octo/contracts TypeScript interfaces.

Convenciones (F0-002, F0-008):
  - TypeScript `AgentNode`        → Python `AgentDefinition`  (CrewAI role/goal pattern)
  - TypeScript `ExecutionRequest` → Python `ExecutionRequest` (Control Plane → Execution Plane)
  - TypeScript `ExecutionResult`  → Python `ExecutionResult`  (Execution Plane → Control Plane)
  - camelCase JSON I/O via alias_generator (OctoModel base)
  - Estos modelos NO son auto-generados. Se mantienen en sync por convención.
    Un test JSON Schema round-trip se añadirá en F1 para detectar drift.

REGLA ABSOLUTA (Principio #1):
  ExecutionRequest NO contiene lógica de orquestación ni topología de agentes.
  Solo el payload necesario para ejecutar UNA tarea de UN agente.
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


class ExecutionStatus(StrEnum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    PAUSED = "paused"


class AgentDefinition(OctoModel):
    """Espejo de AgentNode de @octo/contracts.

    Patrón CrewAI (F0-008): cada agente tiene role, goal, backstory, tools.
    El runtime recibe esta definición y materializa el agente en F2.
    En F0: solo se valida y se loguea.
    """

    id: str = Field(description="UUID del AgentNode en el Control Plane")
    name: str
    role: str = Field(description="CrewAI: qué hace este agente")
    goal: str = Field(description="CrewAI: objetivo principal del agente")
    backstory: str | None = Field(
        default=None,
        description="CrewAI: contexto que moldea el comportamiento",
    )
    model: str = Field(
        default="gpt-4o-mini",
        description="LiteLLM model string (ej: gpt-4o-mini, anthropic/claude-3-haiku)",
    )
    tools: list[str] = Field(
        default_factory=list,
        description="Tool IDs a activar (resueltos en F3)",
    )
    max_iterations: int = Field(
        default=10,
        ge=1,
        le=100,
        description="GovernancePolicy: límite de iteraciones del agent loop",
    )
    token_budget: int = Field(
        default=50_000,
        ge=1_000,
        description="Paperclip budget (F0-010): tokens máximos por ejecución",
    )


class ExecutionRequest(OctoModel):
    """Contrato entre Control Plane y Execution Plane.

    Este es el único punto de entrada al runtime worker.
    El Control Plane construye este payload; el worker solo lo consume.

    trace_id OBLIGATORIO: se propaga a todos los logs y spans OTEL (Principio #9).
    """

    execution_id: str = Field(description="UUIDv7 asignado por el Control Plane")
    trace_id: str = Field(
        description="OTEL trace_id — OBLIGATORIO para observabilidad distribuida"
    )
    run_id: str = Field(description="ID de la run para agrupar executions relacionadas")
    agent: AgentDefinition
    task: dict[str, Any] = Field(
        description="TaskDefinition: input, type, context y metadata"
    )
    governance: dict[str, Any] = Field(
        description="GovernancePolicy del agente (Paperclip F0-010): presupuestos y límites"
    )
    checkpoint: dict[str, Any] | None = Field(
        default=None,
        description="LangGraph checkpoint para pause/resume (F2). None en ejecuciones nuevas.",
    )


class TokenUsage(OctoModel):
    """Token usage stats reportados al Control Plane."""

    prompt_tokens: int = Field(default=0, ge=0)
    completion_tokens: int = Field(default=0, ge=0)
    total_tokens: int = Field(default=0, ge=0)


class ExecutionResult(OctoModel):
    """Respuesta devuelta al Control Plane tras la ejecución.

    En F0: stub con status=completed y result={result: stub}.
    En F2: resultado real del LangGraph StateGraph.
    """

    execution_id: str
    status: ExecutionStatus
    result: dict[str, Any] | None = Field(
        default=None,
        description="Resultado de la ejecución. F0: stub. F2: output del agent loop.",
    )
    error: str | None = None
    token_usage: TokenUsage | None = None
    duration_ms: int = Field(ge=0)
    checkpoint: dict[str, Any] | None = Field(
        default=None,
        description="Estado LangGraph para pause/resume. Seteado solo si status=paused.",
    )
