"""ExecutionResultStore — Redis-backed result cache (C5).

Stores completed ExecutionResponse objects keyed by execution_id.
Used by:
  - IdempotencyStore: serve cached result for duplicate requests
  - Status polling readers: retrieve cached non-authoritative response snapshots

Key:  result:<execution_id>
TTL:  configurable (default 24h)

Ref: TASK 5, TASK 6
"""
from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

import redis.asyncio as aioredis
import structlog

if TYPE_CHECKING:
    from ..contracts import ExecutionResponse

log = structlog.get_logger(__name__)

_RESULT_PREFIX    = "result:{}"
_DEFAULT_TTL_SECS = 86_400  # 24h


class ExecutionResultStore:
    """Redis-backed result cache for completed executions."""

    def __init__(self, redis_url: str, ttl_secs: int = _DEFAULT_TTL_SECS) -> None:
        self._redis = aioredis.from_url(
            redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        self._ttl = ttl_secs

    async def store(
        self,
        execution_id: str,
        response: Any,  # noqa: ANN401
        ttl_secs: int | None = None,
    ) -> None:
        """Persist execution result JSON."""
        key = _RESULT_PREFIX.format(execution_id)
        if hasattr(response, "model_dump_json"):
            payload = response.model_dump_json()
        else:
            payload = json.dumps(response)
        await self._redis.set(key, payload, ex=ttl_secs or self._ttl)
        log.debug(
            "result_store.stored",
            execution_id=execution_id,
            ttl_secs=ttl_secs or self._ttl,
        )

    async def get(self, execution_id: str) -> dict[str, Any] | None:
        """Return cached result dict or None."""
        key = _RESULT_PREFIX.format(execution_id)
        raw = await self._redis.get(key)
        if raw is None:
            return None
        return json.loads(raw)  # type: ignore[return-value]

    async def delete(self, execution_id: str) -> None:
        """Explicit cleanup (e.g. after consumer acknowledged result)."""
        key = _RESULT_PREFIX.format(execution_id)
        await self._redis.delete(key)
        log.debug("result_store.deleted", execution_id=execution_id)

    async def close(self) -> None:
        await self._redis.aclose()
