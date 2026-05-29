"""Execute router — single durable F1 execution entrypoint."""
from __future__ import annotations

import asyncpg
import structlog
from fastapi import APIRouter, Header, HTTPException, Request, status

from ..config import Settings
from ..schemas import ExecutionRequest, ExecutionResult, ExecutionStatus
from ..services.executor import ExecutionService

log = structlog.get_logger(__name__)

router = APIRouter(tags=["execute"])
_settings = Settings()
_executor = ExecutionService()


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
    summary="Submit an F1 execution job",
    description=(
        "Receives an ExecutionRequest from the Control Plane and routes it "
        "through the canonical durable F1 runtime pipeline."
    ),
)
async def submit_execution(
    body: ExecutionRequest,
    request: Request,
    x_internal_secret: str | None = Header(default=None),
) -> ExecutionResult:
    """Accept one execution job from the Control Plane."""
    _verify_internal_secret(x_internal_secret)

    bound_log = log.bind(
        trace_id=body.trace_id,
        run_id=body.run_id,
        execution_id=body.execution_id,
        tenant_id=body.tenant_id,
        agent_id=body.agent_id,
        workspace_id=body.workspace_id,
        path=str(request.url.path),
    )

    bound_log.info(
        "execution.received",
        task_len=len(body.task),
        streaming=body.streaming,
        tool_count=len(body.tools),
    )

    result = await _executor.run(body)

    bound_log.info(
        "execution.completed",
        status=result.status,
        duration_ms=result.duration_ms,
    )

    if result.status != ExecutionStatus.COMPLETED:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"error": result.error or "runtime_execution_failed", "execution_id": result.execution_id},
        )

    return result


@router.get(
    "/execute/{execution_id}/status",
    summary="Poll execution status",
    description="Status polling endpoint backed by the F1 PostgreSQL system of record.",
)
async def get_execution_status(
    execution_id: str,
    x_internal_secret: str | None = Header(default=None),
) -> dict[str, str]:
    """Read execution status without submitting or reclaiming execution work."""
    _verify_internal_secret(x_internal_secret)

    dsn = _settings.database_url
    if not dsn:
        raise HTTPException(status_code=500, detail="DATABASE_URL required")

    conn = await asyncpg.connect(str(dsn))
    try:
        row = await conn.fetchrow("SELECT status FROM executions WHERE id=$1", execution_id)
    finally:
        await conn.close()

    if not row:
        raise HTTPException(status_code=404, detail="execution_not_found")

    return {"execution_id": execution_id, "status": str(row["status"])}
