"""Execution router — recibe jobs del Control Plane.

Endpoints:
  POST /api/v1/execute          — envía un ExecutionRequest al executor
  GET  /api/v1/execute/{id}/status — consulta el status de una ejecución

Security:
  X-Internal-Secret header — shared secret entre Control Plane y Worker.
  Sin este header, 401. Nunca expuesto al frontend (Principio #1).

Trace propagation:
  El trace_id del ExecutionRequest se inyecta en structlog.contextvars
  para que TODOS los logs de esta request incluyan el trace_id.
  Criterio: 'trace_id de la request se propaga a todos los logs y spans'.
"""
from __future__ import annotations

import structlog
import structlog.contextvars
from fastapi import APIRouter, Header, HTTPException, Request, status

from ..config import get_settings
from ..schemas.execution import ExecutionRequest, ExecutionResult, ExecutionStatus
from ..services.executor import ExecutionService

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/execute", tags=["execute"])

_settings = get_settings()
_executor = ExecutionService()


def _verify_internal_secret(secret: str | None) -> None:
    """Verifica el shared secret enviado por el Control Plane."""
    if secret != _settings.api_internal_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal secret",
        )


@router.post(
    "/",
    response_model=ExecutionResult,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit an execution job",
    description=(
        "Recibe un ExecutionRequest del Control Plane y lo despacha al ExecutionService. "
        "F0: retorna stub {result: stub, status: completed}. "
        "F2: ejecución real con LangGraph StateGraph."
    ),
)
async def submit_execution(
    request: Request,
    body: ExecutionRequest,
    x_internal_secret: str | None = Header(default=None),
) -> ExecutionResult:
    """Acepta un job del Control Plane y lo ejecuta.

    El trace_id del body se inyecta en contextvars de structlog
    para que todos los logs descendientes lo incluyan automáticamente.
    """
    _verify_internal_secret(x_internal_secret)

    # Propagar trace_id a todos los logs de esta request (Principio #9)
    structlog.contextvars.clear_contextvars()
    structlog.contextvars.bind_contextvars(
        trace_id=body.trace_id,
        execution_id=body.execution_id,
        run_id=body.run_id,
    )

    log.info(
        "execution.received",
        agent_id=body.agent.id,
        agent_role=body.agent.role,
        model=body.agent.model,
        token_budget=body.agent.token_budget,
        has_checkpoint=body.checkpoint is not None,
    )

    result = await _executor.execute(body)

    return result


@router.get(
    "/{execution_id}/status",
    response_model=dict,
    summary="Get execution status",
    description="Consulta el status de una ejecución por ID. F0: stub.",
)
async def get_execution_status(
    execution_id: str,
    x_internal_secret: str | None = Header(default=None),
) -> dict:
    """F0 stub — el estado real se consulta al Control Plane en F2."""
    _verify_internal_secret(x_internal_secret)
    return {
        "execution_id": execution_id,
        "status": ExecutionStatus.COMPLETED,
        "note": "[F0 stub] Status tracking implemented in F2 via Control Plane.",
    }
