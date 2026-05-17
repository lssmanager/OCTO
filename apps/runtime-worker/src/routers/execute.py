"""Execute router — receives execution jobs from the Control Plane.

Prefix: /api/v1  (registered in main.py)
Endpoints:
  POST /api/v1/execute          — submit an execution job
  GET  /api/v1/execute/{id}/status — poll execution status (F1+)

In F0 this is a scaffold: it validates the request, propagates trace_id
to all log entries, and returns a stub response via ExecutionService.
The real LangGraph / CrewAI execution engine is wired in F2.

Architectural rule (F0-002):
  All execution LOGIC lives in services/executor.py — never in the router.
  The router is responsible only for: HTTP contract, auth, logging, dispatch.
"""
import structlog
from fastapi import APIRouter, Header, HTTPException, Request, status

from ..config import Settings
from ..schemas import ExecutionRequest, ExecutionResult
from ..services.executor import ExecutionService

log = structlog.get_logger(__name__)
router = APIRouter(tags=["execute"])
_settings = Settings()
_executor = ExecutionService(settings=_settings)


def _verify_internal_secret(x_internal_secret: str | None) -> None:
    """Verify the shared secret sent by the Control Plane."""
    if x_internal_secret != _settings.api_internal_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal secret",
        )


@router.post(
    "/execute",
    response_model=ExecutionResult,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit an execution job",
    description=(
        "Receives an ExecutionRequest from the Control Plane and "
        "dispatches it to the AI execution engine. "
        "F0: returns a stub acknowledgement. F2: full LangGraph execution."
    ),
)
async def submit_execution(
    body: ExecutionRequest,
    request: Request,  # noqa: ARG001 — reserved for F1 streaming
    x_internal_secret: str | None = Header(default=None),
) -> ExecutionResult:
    """Accept a job from the Control Plane and run it.

    trace_id and run_id from the request body are bound to every log
    entry produced during this execution — required by F0-002.
    """
    _verify_internal_secret(x_internal_secret)

    # Bind OTEL context to structlog for the lifetime of this coroutine.
    bound_log = log.bind(
        trace_id=body.trace_id,
        run_id=body.run_id,
        execution_id=body.execution_id,
        agent_id=body.agent_id,
        workspace_id=body.workspace_id,
    )

    bound_log.info(
        "execution.received",
        task_len=len(body.task),
        streaming=body.streaming,
        tools=body.tools,
    )

    result = await _executor.run(body)

    bound_log.info(
        "execution.dispatched",
        status=result.status,
        duration_ms=result.duration_ms,
    )

    return result


@router.get(
    "/execute/{execution_id}/status",
    summary="Poll execution status",
    description="Status polling endpoint — implemented in F1.",
)
async def get_execution_status(
    execution_id: str,
    x_internal_secret: str | None = Header(default=None),
) -> dict[str, str]:
    """F0 stub — real status polling wired in F1 via DB query."""
    _verify_internal_secret(x_internal_secret)
    return {
        "execution_id": execution_id,
        "status": "unknown",
        "message": "Status polling not yet implemented (F1).",
    }
