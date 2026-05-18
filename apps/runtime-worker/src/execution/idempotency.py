"""IdempotencyStore — Redis-backed deduplication for execution jobs.

Guarantees that a given execution_id (or idempotency_key) is processed
exactly once even under retry storms, duplicate queue deliveries, or
network retries from the Control Plane.

Algorithm (Redis atomic SETNX pattern):
  1. lock_execution(key, ttl) — SET key NX EX ttl
     - Returns True  → this instance owns the execution, proceed
     - Returns False → duplicate, return cached result
  2. On completion: store_result(key, response)
  3. On cancel/rollback: release(key)

Key naming:
  idempotency:<key>:lock    — ownership lock (NX EX)
  idempotency:<key>:result  — cached ExecutionResponse JSON

TTL defaults:
  lock:   24h  (long enough to cover max retry window)
  result: 24h  (consumers can poll for cached result)

Ref: TASK 5, ABSOLUTE PRINCIPLE 13 (durable execution)
"""
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import redis.asyncio as aioredis
import structlog

if TYPE_CHECKING:
    from ..contracts import ExecutionResponse

log = structlog.get_logger(__name__)

_LOCK_PREFIX   = "idempotency:{}:lock"
_RESULT_PREFIX = "idempotency:{}:result"
_DEFAULT_LOCK_TTL_SECS   = 86_400  # 24h
_DEFAULT_RESULT_TTL_SECS = 86_400  # 24h


class IdempotencyStore:
    """Redis-backed idempotency lock + result cache."""

    def __init__(
        self,
        redis_url: str,
        lock_ttl_secs: int   = _DEFAULT_LOCK_TTL_SECS,
        result_ttl_secs: int = _DEFAULT_RESULT_TTL_SECS,
    ) -> None:
        self._redis = aioredis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        self._lock_ttl   = lock_ttl_secs
        self._result_ttl = result_ttl_secs

    # ------------------------------------------------------------------ lock

    async def lock_execution(self, key: str) -> bool:
        """Atomically acquire execution lock.

        Returns True if this call acquired the lock (proceed with execution).
        Returns False if the lock already exists (duplicate — skip execution).
        """
        lock_key = _LOCK_PREFIX.format(key)
        acquired = await self._redis.set(
            lock_key,
            "1",
            nx=True,         # SET IF NOT EXISTS
            ex=self._lock_ttl,
        )
        result = acquired is not None
        log.debug(
            "idempotency.lock_execution",
            key=key,
            acquired=result,
            ttl_secs=self._lock_ttl,
        )
        return result

    async def release(self, key: str) -> None:
        """Release execution lock (cancel / rollback path)."""
        lock_key = _LOCK_PREFIX.format(key)
        await self._redis.delete(lock_key)
        log.debug("idempotency.released", key=key)

    # --------------------------------------------------------------- results

    async def store_result(self, key: str, response: Any) -> None:  # noqa: ANN401
        """Persist execution result for future duplicate requests."""
        result_key = _RESULT_PREFIX.format(key)
        payload: str
        if hasattr(response, "model_dump_json"):
            payload = response.model_dump_json()
        else:
            payload = json.dumps(response)
        await self._redis.set(result_key, payload, ex=self._result_ttl)
        log.debug("idempotency.result_stored", key=key, ttl_secs=self._result_ttl)

    async def get_cached_result(self, key: str) -> dict[str, Any] | None:
        """Return cached result JSON dict if available, else None."""
        result_key = _RESULT_PREFIX.format(key)
        raw = await self._redis.get(result_key)
        if raw is None:
            return None
        log.info("idempotency.cache_hit", key=key)
        return json.loads(raw)  # type: ignore[return-value]

    # ----------------------------------------------------------------- close

    async def close(self) -> None:
        await self._redis.aclose()
