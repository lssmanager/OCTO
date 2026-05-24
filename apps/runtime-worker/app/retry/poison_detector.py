from __future__ import annotations

import logging
import time

from .policy import ErrorClass


class PoisonDetector:
    def __init__(self, redis, logger=None, metrics=None, threshold: int = 3, ttl_seconds: int = 300, invariant_window_seconds: int = 60):
        self.redis = redis
        self.logger = logger or logging.getLogger(__name__)
        self.metrics = metrics
        self.threshold = threshold
        self.ttl_seconds = ttl_seconds
        self.invariant_window_seconds = invariant_window_seconds

    @staticmethod
    def _key(tenant_id: str, execution_id: str, step_index: int, error_code: str) -> str:
        return f'octo:{tenant_id}:poison:{execution_id}:{step_index}:{error_code}'

    async def record_failure(self, tenant_id: str, execution_id: str, step_index: int, error_code: str, error_class: ErrorClass | str) -> int:
        key = self._key(tenant_id, execution_id, step_index, error_code)
        count = await self.redis.incr(key)
        await self.redis.expire(key, self.ttl_seconds)
        if str(error_class) == ErrorClass.INVARIANT_BREACH:
            await self.redis.set(f'{key}:last_invariant_ts', int(time.time()), ex=self.invariant_window_seconds)
        return int(count)

    async def is_poison(self, tenant_id: str, execution_id: str, step_index: int, error_code: str, error_class: ErrorClass | str | None = None, reclaim_count: int | None = None, max_reclaims: int = 3) -> bool:
        key = self._key(tenant_id, execution_id, step_index, error_code)
        count = int(await self.redis.get(key) or 0)
        if reclaim_count is not None and reclaim_count >= max_reclaims:
            self._emit_metric(tenant_id)
            return True
        if count >= self.threshold:
            self._emit_metric(tenant_id)
            return True
        if str(error_class) == ErrorClass.INVARIANT_BREACH:
            last_ts = await self.redis.get(f'{key}:last_invariant_ts')
            if last_ts is not None:
                self._emit_metric(tenant_id)
                return True
        return False

    def _emit_metric(self, tenant_id: str) -> None:
        if self.metrics and hasattr(self.metrics, 'inc'):
            self.metrics.inc('octo_poison_detected_total', {'tenant_id': tenant_id})
