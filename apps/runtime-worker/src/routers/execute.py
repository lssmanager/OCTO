"""Execute router — receives execution jobs from the Control Plane.

In F0 this is a scaffold: it validates the request and returns a stub
response. The real LangGraph / CrewAI execution engine is wired in F2.
"""
import time

import structlog
from fastapi import APIRouter, Header, HTTPException, status

from ..config import Settings
from ..schemas import ExecutionRequest, ExecutionResult, ExecutionStatus

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/execute", tags=["execute"])
_settings = Settings()


def _verify_internal_secret(x_internal_secret: str | None) -> None:
    """Verify the shared secret sent by the Control Plane."""
    if x_internal_secret != _settings.api_internal_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal secret",
        )


@router.post(
    "/",
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
    x_internal_secret: str | None = Header(default=None),
) -> ExecutionResult:
    """Accept a job from the Control Plane and run it."""
    _verify_internal_secret(x_internal_secret)

    log.info(
        "execution.received",
        execution_id=body.execution_id,
        agent_id=body.agent_id,
        workspace_id=body.workspace_id,
        task_len=len(body.task),
        streaming=body.streaming,
    )

    start = time.monotonic()

    # F0 stub — real LangGraph graph executor wired in F2
    result = ExecutionResult(
        execution_id=body.execution_id,
        status=ExecutionStatus.COMPLETED,
        output="[F0 stub] Execution engine not yet wired. Implement in F2.",
        tool_calls=[],
        usage={"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
        error=None,
        duration_ms=int((time.monotonic() - start) * 1000),
    )

    log.info(
        "execution.completed",
        execution_id=body.execution_id,
        status=result.status,
        duration_ms=result.duration_ms,
    )

    return result
