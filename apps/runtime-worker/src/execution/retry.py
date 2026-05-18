"""Retry policy and DLQ routing for the OCTO execution engine (C5).

RetryPolicy:
  - Configurable per-execution via ExecutionRequest.governance or env defaults
  - Backoff strategies: fixed | exponential | linear
  - Jitter: prevents thundering-herd on simultaneous retries
  - is_retryable(exc): classifies exceptions; non-retryable go to DLQ immediately

DlqReason enum:
  Mirrors the TypeScript DlqReason in @octo/contracts.
  Both sides MUST stay in sync (same commit rule, F0-008).

DlqRouter:
  Posts failed execution metadata to a Redis list (dlq:executions).
  The Control Plane's DlqHandler (NestJS) reads from this list and
  writes the canonical DLQ record to Postgres.

  Communication pattern:
    Python worker  → RPUSH dlq:executions <JSON>
    NestJS control → BLPOP dlq:executions (blocking pop, DlqHandler.ts)

Ref: TASK 5, 6, ABSOLUTE PRINCIPLES 3 (event-driven), 12 (Postgres SOR)
"""
from __future__ import annotations

import json
import math
import random
import time
from enum import Enum
from typing import Any

import redis.asyncio as aioredis
import structlog
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)


# ----------------------------------------------------------------- DlqReason

class DlqReason(str, Enum):
    """Mirrors @octo/contracts DlqReason TypeScript enum."""
    MAX_RETRIES_EXCEEDED   = "MAX_RETRIES_EXCEEDED"
    NON_RETRYABLE_ERROR    = "NON_RETRYABLE_ERROR"
    TIMEOUT                = "TIMEOUT"
    GOVERNANCE_VIOLATION   = "GOVERNANCE_VIOLATION"
    UNHANDLED_EXCEPTION    = "UNHANDLED_EXCEPTION"
    SCHEMA_VALIDATION_ERROR = "SCHEMA_VALIDATION_ERROR"


# --------------------------------------------------------------- RetryPolicy

class RetryPolicy(BaseModel):
    """Configurable retry policy for execution jobs.

    Mirrors RetryPolicy in @octo/queue/src/interfaces.ts.
    Both MUST stay in sync (same commit rule).
    """
    max_attempts:   int   = Field(default=3,     ge=1, le=10)
    backoff:        str   = Field(default="exponential")  # fixed | exponential | linear
    delay_ms:       int   = Field(default=2_000, ge=100)
    max_delay_ms:   int   = Field(default=60_000)
    jitter_factor:  float = Field(default=0.2,   ge=0.0, le=1.0)

    def compute_delay(self, attempt: int) -> float:
        """Return delay in seconds for the given attempt (0-based).

        attempt=0 → first retry after first failure.
        """
        base_ms: float
        match self.backoff:
            case "exponential":
                base_ms = self.delay_ms * (2 ** attempt)
            case "linear":
                base_ms = self.delay_ms * (attempt + 1)
            case _:  # fixed
                base_ms = float(self.delay_ms)

        # Cap
        base_ms = min(base_ms, self.max_delay_ms)

        # Jitter: uniform random in [0, base_ms * jitter_factor]
        jitter_ms = random.uniform(0, base_ms * self.jitter_factor)  # noqa: S311
        total_ms = base_ms + jitter_ms

        return total_ms / 1000  # return seconds for asyncio.sleep

    def is_retryable(self, exc: BaseException) -> bool:
        """Classify an exception as retryable or non-retryable.

        Non-retryable exceptions go directly to DLQ without further attempts:
          - ValueError, TypeError: bad input — retrying won't fix it
          - PermissionError: auth/policy violation
          - OctoNonRetryableError: explicit marker from execution code
          - asyncio.CancelledError: external cancel signal

        Everything else (network errors, timeouts, unexpected exceptions)
        is retryable by default.
        """
        import asyncio
        non_retryable = (
            ValueError,
            TypeError,
            PermissionError,
            asyncio.CancelledError,
        )
        # Check for explicit marker
        if getattr(exc, "retryable", None) is False:
            return False
        return not isinstance(exc, non_retryable)


DEFAULT_EXECUTION_POLICY = RetryPolicy(
    max_attempts=3,
    backoff="exponential",
    delay_ms=2_000,
    max_delay_ms=60_000,
    jitter_factor=0.2,
)

DEFAULT_TOOL_POLICY = RetryPolicy(
    max_attempts=5,
    backoff="exponential",
    delay_ms=1_000,
    max_delay_ms=30_000,
    jitter_factor=0.1,
)


# ----------------------------------------------------------------- DlqRouter

_DLQ_KEY = "dlq:executions"


class DlqRouter:
    """Posts failed execution metadata to a Redis DLQ list.

    The NestJS Control Plane's DlqHandler reads from this list via
    BLPOP and writes the canonical record to Postgres.

    Why Redis list instead of a BullMQ DLQ queue:
      The Python worker must not have orchestration authority (Principle 1).
      Using a simple Redis list keeps the Execution Plane stateless —
      the Control Plane owns the DLQ lifecycle.
    """

    def __init__(self, redis_url: str) -> None:
        self._redis = aioredis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
        )

    async def route(
        self,
        execution_id: str,
        reason: DlqReason,
        payload: dict[str, Any],
        *,
        trace_id: str = "",
        run_id: str = "",
    ) -> None:
        """Push a DLQ entry to the Redis list.

        The Control Plane pops from dlq:executions and persists to Postgres.
        """
        entry: dict[str, Any] = {
            "execution_id": execution_id,
            "reason":       reason.value,
            "trace_id":     trace_id,
            "run_id":       run_id,
            "routed_at":    time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "payload":      payload,
        }
        await self._redis.rpush(_DLQ_KEY, json.dumps(entry))
        log.warning(
            "dlq.routed",
            execution_id=execution_id,
            reason=reason.value,
            trace_id=trace_id,
        )

    async def close(self) -> None:
        await self._redis.aclose()
