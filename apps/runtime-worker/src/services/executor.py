"""ExecutionService — Execution Plane core service.

REGLA ABSOLUTA (Principio Arquitectónico #1 + #2):
  Este servicio NUNCA debe:
    - Contener lógica de orquestación o scheduling
    - Evaluar governance policies (eso es el Control Plane)
    - Persistir estado con autoridad (escribe solo vía callback al CP)
    - Importar nada de apps/api o packages/database

  Este servicio SÍ puede:
    - Ejecutar tasks recibidas del Control Plane
    - Llamar LLMs via LiteLLM (F2)
    - Invocar tools registradas (F3)
    - Recuperar memoria via Qdrant (F4)
    - Reportar progreso via HTTP callback al Control Plane
    - Retornar ExecutionResult

F0: retorna stub. Implementación real (LangGraph StateGraph) en F2.
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog

from ..config import get_settings
from ..schemas.execution import (
    AgentDefinition,
    ExecutionRequest,
    ExecutionResult,
    ExecutionStatus,
    TokenUsage,
)

log = structlog.get_logger(__name__)


class ExecutionService:
    """Stateless executor — recibe ExecutionRequest, retorna ExecutionResult.

    Stateless: todo el estado vive en PostgreSQL/Redis (Principio #12).
    El worker puede reiniciarse en cualquier momento sin perder estado.

    F0: stub de ejecución.
    F2: LangGraph StateGraph con checkpointing.
    """

    def __init__(self) -> None:
        self._settings = get_settings()
        self._timeout_secs = self._settings.execution_timeout_secs

    async def execute(self, request: ExecutionRequest) -> ExecutionResult:
        """Ejecuta un ExecutionRequest y retorna ExecutionResult.

        El trace_id se inyecta en el contexto de structlog para que
        TODOS los logs de esta ejecución incluyan el trace_id automáticamente.
        Esto satisface el criterio: 'trace_id se propaga a todos los logs y spans'.
        """
        # Bind trace context a todos los logs de esta ejecución
        bound_log = log.bind(
            execution_id=request.execution_id,
            trace_id=request.trace_id,
            run_id=request.run_id,
            agent_id=request.agent.id,
            agent_role=request.agent.role,
        )

        bound_log.info(
            "executor.start",
            model=request.agent.model,
            token_budget=request.agent.token_budget,
            max_iterations=request.agent.max_iterations,
            has_checkpoint=request.checkpoint is not None,
        )

        start = time.monotonic()

        try:
            result = await asyncio.wait_for(
                self._run(request, bound_log),
                timeout=self._timeout_secs,
            )
        except asyncio.TimeoutError:
            duration_ms = int((time.monotonic() - start) * 1000)
            bound_log.error(
                "executor.timeout",
                timeout_secs=self._timeout_secs,
                duration_ms=duration_ms,
            )
            return ExecutionResult(
                execution_id=request.execution_id,
                status=ExecutionStatus.FAILED,
                result=None,
                error=f"Execution timed out after {self._timeout_secs}s",
                token_usage=None,
                duration_ms=duration_ms,
                checkpoint=None,
            )

        duration_ms = int((time.monotonic() - start) * 1000)
        result = ExecutionResult(
            execution_id=result.execution_id,
            status=result.status,
            result=result.result,
            error=result.error,
            token_usage=result.token_usage,
            duration_ms=duration_ms,
            checkpoint=result.checkpoint,
        )

        bound_log.info(
            "executor.complete",
            status=result.status,
            duration_ms=duration_ms,
        )

        return result

    async def _run(
        self,
        request: ExecutionRequest,
        bound_log: Any,
    ) -> ExecutionResult:
        """Core execution logic.

        F0: stub — retorna {result: stub, status: completed}.
        F2: LangGraph StateGraph con ReAct loop, tool calls, checkpointing.

        El stub cumple el criterio de aceptación:
        'F0: el executor retorna un stub {result: stub, status: completed}'
        """
        bound_log.info(
            "executor.f0_stub",
            note="Real LangGraph execution engine wired in F2",
        )

        # F0 STUB — reemplazar en F2 con LangGraph StateGraph
        return ExecutionResult(
            execution_id=request.execution_id,
            status=ExecutionStatus.COMPLETED,
            result={
                "result": "stub",
                "message": "[F0 stub] Execution engine not yet wired. Implement in F2.",
                "agent_role": request.agent.role,
                "agent_goal": request.agent.goal,
            },
            error=None,
            token_usage=TokenUsage(
                prompt_tokens=0,
                completion_tokens=0,
                total_tokens=0,
            ),
            duration_ms=0,  # sobreescrito por execute()
            checkpoint=None,
        )
