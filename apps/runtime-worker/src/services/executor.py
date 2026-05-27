from __future__ import annotations

import time

import structlog

from ..f1_runtime import run_f1_execution
from ..schemas import ExecutionRequest, ExecutionResult, ExecutionStatus

log = structlog.get_logger(__name__)


class ExecutionService:
    """Canonical F1 runtime adapter.

    Both `/execute` and `/execute/internal` must route through this service
    so runtime behavior is single-path and durable.
    """

    async def run(self, request: ExecutionRequest) -> ExecutionResult:
        if not request.tenant_id:
            return ExecutionResult(
                execution_id=request.execution_id,
                status=ExecutionStatus.FAILED,
                output=None,
                error="tenant_id is required for durable runtime execution",
                usage={},
                duration_ms=0,
            )

        start = time.monotonic()
        result = await run_f1_execution(
            execution_id=request.execution_id,
            tenant_id=request.tenant_id,
            trace_id=request.trace_id,
        )
        duration_ms = int((time.monotonic() - start) * 1000)

        status = ExecutionStatus.COMPLETED if result.get("status") == "succeeded" else ExecutionStatus.FAILED
        return ExecutionResult(
            execution_id=request.execution_id,
            status=status,
            output=str(result.get("output", "runtime-response")) if status == ExecutionStatus.COMPLETED else None,
            error=None if status == ExecutionStatus.COMPLETED else str(result),
            usage={},
            duration_ms=duration_ms,
        )

    async def close(self) -> None:
        return None
