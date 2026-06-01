from __future__ import annotations

import time
from typing import Any

import structlog

from ..f1_runtime import run_f1_execution
from ..schemas import ExecutionRequest, ExecutionResult, ExecutionStatus

log = structlog.get_logger(__name__)


class ExecutionService:
    """Canonical F1 runtime adapter."""

    async def run(self, request: ExecutionRequest) -> ExecutionResult:
        start = time.monotonic()

        try:
            result: dict[str, Any] = await run_f1_execution(
                execution_id=request.execution_id,
                tenant_id=request.tenant_id,
                trace_id=request.trace_id,
                mode=request.mode,
                lease_token=request.lease_token,
                attempt=request.attempt,
                lease_owner=request.lease_owner,
            )
        except Exception as exc:
            duration_ms = int((time.monotonic() - start) * 1000)
            log.exception(
                "execution.f1_runtime_failed",
                execution_id=request.execution_id,
                tenant_id=request.tenant_id,
                trace_id=request.trace_id,
            )
            return ExecutionResult(
                execution_id=request.execution_id,
                status=ExecutionStatus.FAILED,
                output=None,
                tool_calls=[],
                usage={},
                error=str(exc),
                duration_ms=duration_ms,
                checkpoint=None,
            )

        duration_ms = int((time.monotonic() - start) * 1000)
        raw_status = str(result.get("status", "")).lower()
        status = (
            ExecutionStatus.COMPLETED
            if raw_status in {"succeeded", "completed"}
            else ExecutionStatus.FAILED
        )

        return ExecutionResult(
            execution_id=request.execution_id,
            status=status,
            output=str(result.get("output", "")) if status == ExecutionStatus.COMPLETED else None,
            tool_calls=list(result.get("tool_calls", [])),
            usage=dict(result.get("usage", {})),
            error=None if status == ExecutionStatus.COMPLETED else str(result),
            duration_ms=duration_ms,
            checkpoint=result.get("checkpoint"),
        )

    async def close(self) -> None:
        return None
