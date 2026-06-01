"""Execute router — single durable F1 execution entrypoint."""
from __future__ import annotations

import asyncio

import asyncpg
import structlog
from fastapi import APIRouter, Header, HTTPException, Request, status

from ..config import Settings
from ..schemas import ExecutionAccepted, ExecutionRequest, ExecutionStatus
from ..services.executor import ExecutionService

log = structlog.get_logger(__name__)

router = APIRouter(tags=["execute"])
_settings = Settings()
_executor = ExecutionService()
_inflight_tasks: set[asyncio.Task[None]] = set()


def _verify_internal_secret(x_internal_secret: str | None) -> None:
    """Verify the shared secret sent by the Control Plane."""
    if x_internal_secret != _settings.api_internal_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid internal secret",
        )


async def _run_accepted_execution(body: ExecutionRequest, bound_log: structlog.BoundLogger) -> None:
    """Run the accepted execution outside the HTTP request lifecycle."""
    try:
        result = await _executor.run(body)
        if result.status == ExecutionStatus.COMPLETED:
            bound_log.info(
                "execution.completed",
                status=result.status,
                duration_ms=result.duration_ms,
            )
        else:
            bound_log.error(
                "execution.failed",
                status=result.status,
                duration_ms=result.duration_ms,
                error=result.error or "runtime_execution_failed",
            )
    except Exception as exc:  # noqa: BLE001 - keep accepted request decoupled from runtime failure
        bound_log.exception("execution.background_task_failed", error=str(exc))


@router.post(
    "/execute",
    response_model=ExecutionAccepted,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Submit an F1 execution job",
    description=(
        "Receives an ExecutionRequest from the scheduler dispatcher and accepts it "
        "for asynchronous runtime processing. The 202 response only confirms "
        "handoff acceptance; execution completion is observed from PostgreSQL status "
        "and outbox events."
    ),
)
async def submit_execution(
    body: ExecutionRequest,
    request: Request,
    x_internal_secret: str | None = Header(default=None),
) -> ExecutionAccepted:
    """Accept one execution job from the scheduler dispatcher without blocking."""
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

    max_inflight = _settings.max_concurrent_executions
    if len(_inflight_tasks) >= max_inflight:
        bound_log.warning(
            "execution.rejected_runtime_capacity",
            inflight_count=len(_inflight_tasks),
            max_concurrent_executions=max_inflight,
        )
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="runtime_execution_capacity_exhausted",
            headers={"Retry-After": "1"},
        )

    bound_log.info(
        "execution.accepted",
        task_len=len(body.task),
        streaming=body.streaming,
        tool_count=len(body.tools),
        mode=body.mode,
        inflight_count=len(_inflight_tasks) + 1,
        max_concurrent_executions=max_inflight,
    )

    task = asyncio.create_task(_run_accepted_execution(body, bound_log))
    _inflight_tasks.add(task)
    task.add_done_callback(_inflight_tasks.discard)

    return ExecutionAccepted(execution_id=body.execution_id, mode=body.mode)


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
