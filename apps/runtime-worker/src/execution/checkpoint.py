"""CheckpointStore — Redis-backed execution checkpoints (C5).

Enables durable execution that survives container restarts.
(ABSOLUTE PRINCIPLE 13: Durable Execution is Required)

Checkpoint structure:
  Key:   checkpoint:<execution_id>
  Value: JSON { step, state, saved_at, execution_id }
  TTL:   7 days (configurable)

Usage pattern for non-authoritative support checkpoints:
  # Before starting
  cp = await checkpoint_store.load(execution_id)
  start_step = cp["step"] if cp else 0

  # After each step
  await checkpoint_store.save(execution_id, step=current_step, state=state)

  # On success
  await checkpoint_store.delete(execution_id)

Ref: TASK 6, ABSOLUTE PRINCIPLE 13
"""
from __future__ import annotations

import json
import time
from typing import Any

import redis.asyncio as aioredis
import structlog

log = structlog.get_logger(__name__)

_CP_PREFIX       = "checkpoint:{}"
_DEFAULT_TTL_SECS = 604_800  # 7 days


class CheckpointStore:
    """Redis-backed checkpoint persistence for durable execution."""

    def __init__(self, redis_url: str, ttl_secs: int = _DEFAULT_TTL_SECS) -> None:
        self._redis = aioredis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        self._ttl = ttl_secs

    async def save(
        self,
        execution_id: str,
        step: int,
        state: dict[str, Any],
    ) -> None:
        """Persist checkpoint for execution at the given step.

        Overwrites any previous checkpoint for the same execution_id.
        Refreshes TTL on every write.
        """
        key = _CP_PREFIX.format(execution_id)
        data = {
            "execution_id": execution_id,
            "step":         step,
            "state":        state,
            "saved_at":     time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        }
        await self._redis.set(key, json.dumps(data), ex=self._ttl)
        log.debug(
            "checkpoint.saved",
            execution_id=execution_id,
            step=step,
            ttl_secs=self._ttl,
        )

    async def load(self, execution_id: str) -> dict[str, Any] | None:
        """Load the latest checkpoint for this execution, or None if not found."""
        key = _CP_PREFIX.format(execution_id)
        raw = await self._redis.get(key)
        if raw is None:
            return None
        data: dict[str, Any] = json.loads(raw)
        log.info(
            "checkpoint.loaded",
            execution_id=execution_id,
            step=data.get("step"),
            saved_at=data.get("saved_at"),
        )
        return data

    async def delete(self, execution_id: str) -> None:
        """Remove checkpoint after successful completion."""
        key = _CP_PREFIX.format(execution_id)
        await self._redis.delete(key)
        log.debug("checkpoint.deleted", execution_id=execution_id)

    async def close(self) -> None:
        await self._redis.aclose()
