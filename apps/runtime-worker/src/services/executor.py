"""ExecutionService — HTTP adapter for ExecutionEngine.

This service is the thin adapter between the FastAPI router (HTTP contract)
and the ExecutionEngine (durable execution logic).

C5 changes:
  - Delegates to ExecutionEngine.run() instead of _run_stub()
  - ExecutionEngine provides: idempotency, checkpointing, retry, DLQ routing
  - This class remains a stateless HTTP adapter — no execution logic here

Architectural rules (F0-002, F0-009):
  - This service NEVER imports from apps/api (control plane)
  - This service NEVER writes to agents or topology tables
  - This service NEVER evaluates governance policies
  - All state that must persist lives in PostgreSQL via the control plane
  - trace_id propagation is mandatory for every log entry and span
"""
from __future__ import annotations

import time
from typing import TYPE_CHECKING

import structlog

from ..execution import ExecutionEngine
from ..schemas import ExecutionRequest, ExecutionResult, ExecutionStatus

if TYPE_CHECKING:
    from ..config import Settings

log = structlog.get_logger(__name__)


class ExecutionService:
    """HTTP adapter — bridges the FastAPI router to ExecutionEngine.

    Instantiated once at module load (singleton via router module globals).
    The ExecutionEngine is stateless; all mutable state lives in Redis.
    """

    def __init__(self, settings: Settings) -> None:
        self._engine = ExecutionEngine(
            redis_url=settings.redis_url,
            max_execution_timeout_ms=settings.max_execution_timeout_ms,
            build_phase=settings.build_phase,
        )
        self._phase = settings.build_phase

    async def run(self, request: ExecutionRequest) -> ExecutionResult:
        """Execute a task and return a structured result.

        Delegates to ExecutionEngine.run() which provides:
          - Idempotency (deduplicate duplicate requests)
          - Checkpoint resume (survive container restarts)
          - Retry with backoff + jitter
          - DLQ routing on non-retryable failure or max retries exceeded
          - OTel span per execution
          - Structured logging with trace_id + execution_id on every line
        """
        bound_log = log.bind(
            trace_id=request.trace_id,
            run_id=request.run_id,
            execution_id=request.execution_id,
            agent_id=request.agent_id,
        )
        bound_log.info("executor.run.start", phase=self._phase)

        start = time.monotonic()
        result = await self._engine.run(request, attempt=0)
        duration_ms = int((time.monotonic() - start) * 1000)

        bound_log.info(
            "executor.run.complete",
            status=result.status,
            duration_ms=duration_ms,
        )
        return result

    async def close(self) -> None:
        """Close Redis connections. Call in lifespan teardown."""
        await self._engine.close()
