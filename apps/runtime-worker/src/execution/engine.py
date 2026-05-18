"""ExecutionEngine — durable execution orchestrator (C5).

This is the single entry point for all execution jobs in the Runtime Worker.
Replaces the F0 ExecutionService._run_stub() with full durability guarantees.

Execution flow:
  1. Idempotency check
     IdempotencyStore.lock_execution(idempotency_key or execution_id)
     → if False (duplicate): return cached result

  2. Checkpoint resume
     CheckpointStore.load(execution_id)
     → if found: skip completed steps (F1+ step-level resume)
     → if not found: start from step 0

  3. OTel span 'execution.run'
     Attributes: execution_id, agent_id, attempt, trace_id, phase

  4. asyncio.wait_for(timeout=max_execution_timeout_ms)
     Runs self._dispatch(request, checkpoint)
     → F0: stub executor (returns immediately)
     → F1+: LangGraph StateGraph / CrewAI engine

  5. Success path:
     a. ExecutionResultStore.store(execution_id, response)
     b. CheckpointStore.delete(execution_id)
     c. IdempotencyStore.store_result(key, response)

  6. Retryable failure (exc.retryable != False, not ValueError/TypeError):
     a. CheckpointStore.save(execution_id, step=last_step, state={})
     b. Compute backoff delay via RetryPolicy.compute_delay(attempt)
     c. Log and re-raise — BullMQ IWorker handles the retry schedule

  7. Non-retryable failure / max retries exceeded:
     a. DlqRouter.route(execution_id, reason, payload)
     b. ExecutionResultStore.store(execution_id, failed_response)
     c. IdempotencyStore.release(key)
     d. Log and re-raise

Architectural rules:
  - Engine NEVER writes to Postgres directly (Principle 12)
  - Engine NEVER calls Control Plane HTTP endpoints (Principle 1)
  - All coordination is via Redis (checkpoints, DLQ list, idempotency)
  - Postgres writes happen via the Control Plane's event-driven handlers

Ref: TASK 5, TASK 6, ABSOLUTE PRINCIPLES 1, 3, 12, 13
"""
from __future__ import annotations

import asyncio
import time
from typing import Any

import structlog
from opentelemetry import trace
from opentelemetry.trace import SpanKind, StatusCode

from ..contracts import (
    ExecutionError,
    ExecutionResponse,
    ExecutionStatus,
    TaskResult,
    TokenUsage,
)
from ..schemas import ExecutionRequest, ExecutionResult
from .checkpoint import CheckpointStore
from .idempotency import IdempotencyStore
from .result_store import ExecutionResultStore
from .retry import DEFAULT_EXECUTION_POLICY, DlqReason, DlqRouter, RetryPolicy

log = structlog.get_logger(__name__)
tracer = trace.get_tracer("octo.execution.engine")


class ExecutionEngine:
    """Durable execution orchestrator.

    Instantiate once per worker process; all state lives in Redis.
    """

    def __init__(
        self,
        redis_url: str,
        max_execution_timeout_ms: int,
        build_phase: str = "F0",
        retry_policy: RetryPolicy | None = None,
    ) -> None:
        self._timeout_ms     = max_execution_timeout_ms
        self._phase          = build_phase
        self._retry_policy   = retry_policy or DEFAULT_EXECUTION_POLICY

        self._idempotency    = IdempotencyStore(redis_url)
        self._checkpoints    = CheckpointStore(redis_url)
        self._results        = ExecutionResultStore(redis_url)
        self._dlq            = DlqRouter(redis_url)

    # ------------------------------------------------------------------ public

    async def run(
        self,
        request: ExecutionRequest,
        attempt: int = 0,
    ) -> ExecutionResult:
        """Execute with full durability guarantees.

        Returns ExecutionResult (HTTP schema) so the router contract is preserved.
        """
        idempotency_key = getattr(request, "idempotency_key", None) or request.execution_id
        execution_id    = request.execution_id
        bound_log       = log.bind(
            trace_id=request.trace_id,
            run_id=request.run_id,
            execution_id=execution_id,
            agent_id=request.agent_id,
            attempt=attempt,
        )

        # 1 ─ Idempotency check ─────────────────────────────────────────────────
        owned = await self._idempotency.lock_execution(idempotency_key)
        if not owned:
            cached = await self._idempotency.get_cached_result(idempotency_key)
            if cached:
                bound_log.info("engine.idempotency.cache_hit", key=idempotency_key)
                return self._cached_to_result(cached, execution_id)
            # Lock exists but no result yet — concurrent execution in progress.
            # Return a pending response; the caller should retry later.
            bound_log.warning(
                "engine.idempotency.concurrent_execution",
                key=idempotency_key,
                msg="Another worker is processing this execution_id",
            )
            return ExecutionResult(
                execution_id=execution_id,
                status=ExecutionStatus.RUNNING,
                output=None,
                error="Execution is already in progress (concurrent lock held)",
                usage={},
                duration_ms=0,
            )

        # 2 ─ Checkpoint resume ──────────────────────────────────────────────
        checkpoint = await self._checkpoints.load(execution_id)
        if checkpoint:
            bound_log.info(
                "engine.checkpoint.resuming",
                step=checkpoint.get("step", 0),
                saved_at=checkpoint.get("saved_at"),
            )

        # 3–4 ─ OTel span + timed execution ──────────────────────────────────
        start = time.monotonic()

        with tracer.start_as_current_span(
            "execution.run",
            kind=SpanKind.INTERNAL,
            attributes={
                "execution.id":    execution_id,
                "execution.agent": request.agent_id,
                "execution.attempt": attempt,
                "execution.phase":   self._phase,
                "octo.trace_id":     request.trace_id,
            },
        ) as span:
            try:
                response = await asyncio.wait_for(
                    self._dispatch(request, checkpoint),
                    timeout=self._timeout_ms / 1000,
                )

                duration_ms = int((time.monotonic() - start) * 1000)
                span.set_attribute("execution.duration_ms", duration_ms)
                span.set_status(StatusCode.OK)

                # 5 ─ Success path
                await self._results.store(execution_id, response)
                await self._checkpoints.delete(execution_id)
                await self._idempotency.store_result(idempotency_key, response)

                bound_log.info(
                    "engine.run.complete",
                    status=response.status,
                    duration_ms=duration_ms,
                )
                return self._response_to_result(response, duration_ms)

            except asyncio.TimeoutError:
                duration_ms = int((time.monotonic() - start) * 1000)
                span.set_status(StatusCode.ERROR, "execution timeout")
                bound_log.error(
                    "engine.run.timeout",
                    timeout_ms=self._timeout_ms,
                    duration_ms=duration_ms,
                )
                # Timeout is non-retryable — send to DLQ
                await self._handle_non_retryable(
                    execution_id=execution_id,
                    idempotency_key=idempotency_key,
                    reason=DlqReason.TIMEOUT,
                    error_msg=f"Execution timed out after {self._timeout_ms}ms",
                    request=request,
                    duration_ms=duration_ms,
                    trace_id=request.trace_id,
                    run_id=request.run_id,
                )
                return ExecutionResult(
                    execution_id=execution_id,
                    status=ExecutionStatus.FAILED,
                    output=None,
                    error=f"Execution timed out after {self._timeout_ms}ms",
                    usage={},
                    duration_ms=duration_ms,
                )

            except Exception as exc:  # noqa: BLE001
                duration_ms = int((time.monotonic() - start) * 1000)
                span.record_exception(exc)
                span.set_status(StatusCode.ERROR, str(exc))

                retryable = self._retry_policy.is_retryable(exc)
                max_exceeded = attempt >= (self._retry_policy.max_attempts - 1)

                if retryable and not max_exceeded:
                    # 6 ─ Retryable failure
                    delay_secs = self._retry_policy.compute_delay(attempt)
                    bound_log.warning(
                        "engine.run.retryable_failure",
                        error=str(exc),
                        attempt=attempt,
                        next_delay_secs=round(delay_secs, 2),
                        duration_ms=duration_ms,
                    )
                    # Save checkpoint so next attempt can resume from last step
                    await self._checkpoints.save(
                        execution_id,
                        step=checkpoint.get("step", 0) if checkpoint else 0,
                        state={"last_error": str(exc), "attempt": attempt},
                    )
                    # Sleep backoff — in BullMQ-driven flow, BullMQ owns the delay;
                    # in HTTP-driven flow (direct POST), we sleep here.
                    await asyncio.sleep(delay_secs)
                    raise  # propagate to BullMQ IWorker for retry scheduling

                else:
                    # 7 ─ Non-retryable or max retries exceeded
                    reason = (
                        DlqReason.MAX_RETRIES_EXCEEDED if max_exceeded
                        else DlqReason.NON_RETRYABLE_ERROR
                    )
                    bound_log.error(
                        "engine.run.non_retryable",
                        error=str(exc),
                        reason=reason.value,
                        attempt=attempt,
                        duration_ms=duration_ms,
                    )
                    await self._handle_non_retryable(
                        execution_id=execution_id,
                        idempotency_key=idempotency_key,
                        reason=reason,
                        error_msg=str(exc),
                        request=request,
                        duration_ms=duration_ms,
                        trace_id=request.trace_id,
                        run_id=request.run_id,
                    )
                    return ExecutionResult(
                        execution_id=execution_id,
                        status=ExecutionStatus.FAILED,
                        output=None,
                        error=str(exc),
                        usage={},
                        duration_ms=duration_ms,
                    )

    # --------------------------------------------------------------- dispatch

    async def _dispatch(
        self,
        request: ExecutionRequest,
        checkpoint: dict[str, Any] | None,  # noqa: ARG002 — used in F1+
    ) -> ExecutionResponse:
        """Dispatch to the actual execution backend.

        F0: returns a structured stub immediately.
        F1+: route to LangGraph StateGraph or CrewAI based on request.task.type.

        The checkpoint parameter carries the last saved state for resume;
        F0 ignores it, F1+ uses it to skip completed steps.
        """
        # F0 stub — replace with:
        #   F1: await self._run_langgraph(request, checkpoint)
        #   F2: await self._run_crewai(request, checkpoint)
        await asyncio.sleep(0)  # yield to event loop

        return ExecutionResponse(
            execution_id=request.execution_id,
            status="completed",
            result=TaskResult(
                output=(
                    f"[{self._phase} stub] Execution engine not yet wired. "
                    "Replace _dispatch() with LangGraph StateGraph in F1."
                ),
                output_type="text",
                confidence=None,
                sources=[],
            ),
            error=None,
            token_usage=TokenUsage(
                prompt_tokens=0,
                completion_tokens=0,
                total_tokens=0,
            ),
            duration_ms=0,
        )

    # --------------------------------------------------------- helpers

    async def _handle_non_retryable(
        self,
        *,
        execution_id: str,
        idempotency_key: str,
        reason: DlqReason,
        error_msg: str,
        request: ExecutionRequest,
        duration_ms: int,
        trace_id: str,
        run_id: str,
    ) -> None:
        failed_response = ExecutionResponse(
            execution_id=execution_id,
            status="failed",
            result=None,
            error=ExecutionError(
                code=reason.value,
                message=error_msg,
                retryable=False,
            ),
            token_usage=None,
            duration_ms=duration_ms,
        )
        await self._dlq.route(
            execution_id=execution_id,
            reason=reason,
            payload={
                "agent_id": request.agent_id,
                "task_type": request.task.type if request.task else None,
                "error": error_msg,
                "duration_ms": duration_ms,
            },
            trace_id=trace_id,
            run_id=run_id,
        )
        await self._results.store(execution_id, failed_response)
        await self._idempotency.release(idempotency_key)

    def _response_to_result(self, response: ExecutionResponse, duration_ms: int) -> ExecutionResult:
        """Convert internal ExecutionResponse to the HTTP ExecutionResult schema."""
        from ..schemas import ExecutionResult as HttpResult

        usage: dict[str, Any] = {}
        if response.token_usage:
            usage = {
                "prompt_tokens":      response.token_usage.prompt_tokens,
                "completion_tokens":  response.token_usage.completion_tokens,
                "total_tokens":       response.token_usage.total_tokens,
            }
        return HttpResult(
            execution_id=response.execution_id,
            status=response.status,
            output=response.result.output if response.result else None,
            error=response.error.message if response.error else None,
            usage=usage,
            duration_ms=duration_ms,
            checkpoint=None,
            tool_calls=[],
        )

    def _cached_to_result(self, cached: dict[str, Any], execution_id: str) -> ExecutionResult:
        """Convert cached result dict to ExecutionResult."""
        from ..schemas import ExecutionResult as HttpResult

        return HttpResult(
            execution_id=execution_id,
            status=cached.get("status", "completed"),
            output=cached.get("result", {}).get("output") if cached.get("result") else None,
            error=cached.get("error", {}).get("message") if cached.get("error") else None,
            usage=cached.get("token_usage") or {},
            duration_ms=cached.get("duration_ms", 0),
            checkpoint=None,
            tool_calls=[],
        )

    # --------------------------------------------------------------- cleanup

    async def close(self) -> None:
        """Close all Redis connections. Call in lifespan teardown."""
        await self._idempotency.close()
        await self._checkpoints.close()
        await self._results.close()
        await self._dlq.close()
