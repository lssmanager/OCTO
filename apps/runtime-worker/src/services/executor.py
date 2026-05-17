"""ExecutionService — core execution logic for the AI Execution Plane.

F0 implementation: stateless stub that validates the request contract
and returns a structured ExecutionResult with status=completed.

F1+ will replace the stub body with:
  - LangGraph StateGraph execution
  - CrewAI agent materialisation from AgentDefinition
  - LiteLLM provider calls via the proxy
  - Checkpoint serialisation for pause/resume

Architectural rules (F0-002, F0-009):
  - This service NEVER imports from apps/api (control plane)
  - This service NEVER writes to agents or topology tables
  - This service NEVER evaluates governance policies (control plane's job)
  - All state that must persist lives in PostgreSQL via the control plane
  - trace_id propagation is mandatory for every log entry and span
"""
from __future__ import annotations

import asyncio
import time
from typing import TYPE_CHECKING

import structlog

from ..schemas import ExecutionRequest, ExecutionResult, ExecutionStatus

if TYPE_CHECKING:
    from ..config import Settings

log = structlog.get_logger(__name__)


class ExecutionService:
    """Stateless execution service.

    Instantiated once at module load (singleton via router module globals).
    Must remain stateless: every run() call is independent.
    """

    def __init__(self, settings: Settings) -> None:
        self._timeout_ms = settings.max_execution_timeout_ms
        self._phase = settings.build_phase

    async def run(self, request: ExecutionRequest) -> ExecutionResult:
        """Execute a task and return a structured result.

        F0: returns a stub immediately.
        F1+: will call _execute_langgraph() or _execute_crewai().

        Timeout is enforced via asyncio.wait_for using max_execution_timeout_ms.
        """
        bound_log = log.bind(
            trace_id=request.trace_id,
            run_id=request.run_id,
            execution_id=request.execution_id,
            agent_id=request.agent_id,
        )

        bound_log.info("executor.run.start", phase=self._phase)
        start = time.monotonic()

        try:
            result = await asyncio.wait_for(
                self._run_stub(request),
                timeout=self._timeout_ms / 1000,
            )
        except asyncio.TimeoutError:
            duration_ms = int((time.monotonic() - start) * 1000)
            bound_log.error(
                "executor.run.timeout",
                timeout_ms=self._timeout_ms,
                duration_ms=duration_ms,
            )
            return ExecutionResult(
                execution_id=request.execution_id,
                status=ExecutionStatus.FAILED,
                output=None,
                error=f"Execution timed out after {self._timeout_ms}ms",
                usage={},
                duration_ms=duration_ms,
            )
        except Exception as exc:  # noqa: BLE001
            duration_ms = int((time.monotonic() - start) * 1000)
            bound_log.exception(
                "executor.run.error",
                error=str(exc),
                duration_ms=duration_ms,
            )
            return ExecutionResult(
                execution_id=request.execution_id,
                status=ExecutionStatus.FAILED,
                output=None,
                error=str(exc),
                usage={},
                duration_ms=duration_ms,
            )

        bound_log.info(
            "executor.run.complete",
            status=result.status,
            duration_ms=result.duration_ms,
        )
        return result

    # ------------------------------------------------------------------
    # F0 stub — replace with LangGraph/CrewAI engine in F1/F2
    # ------------------------------------------------------------------

    async def _run_stub(self, request: ExecutionRequest) -> ExecutionResult:
        """F0 stub executor.

        Returns a minimal valid ExecutionResult so the full HTTP contract
        can be exercised end-to-end before the real engine exists.
        Replace this method body in F1 with the LangGraph StateGraph call.
        """
        start = time.monotonic()

        # Simulate minimal async work so the event loop stays non-blocking.
        await asyncio.sleep(0)

        return ExecutionResult(
            execution_id=request.execution_id,
            status=ExecutionStatus.COMPLETED,
            output=(
                f"[{self._phase} stub] Execution engine not yet wired. "
                "Implement LangGraph StateGraph in F2."
            ),
            tool_calls=[],
            usage={
                "prompt_tokens": 0,
                "completion_tokens": 0,
                "total_tokens": 0,
            },
            error=None,
            duration_ms=int((time.monotonic() - start) * 1000),
            checkpoint=None,
        )
