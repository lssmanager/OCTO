from __future__ import annotations

import re

from app.resilience.models import CircuitBreakerConfig, CircuitBreakerState


class CircuitBreaker:
    def __init__(self, tenant_id: str, provider: str, model: str, config: CircuitBreakerConfig, redis: object, metrics: object | None = None, logger: object | None = None) -> None:
        if not tenant_id:
            raise ValueError("tenant_id required")
        self.tenant_id = tenant_id
        self.provider = re.sub(r"[^a-zA-Z0-9_.-]", "_", provider)
        self.model = re.sub(r"[^a-zA-Z0-9_.-]", "_", model)
        self.config = config
        self.redis = redis
        self.metrics = metrics
        self.logger = logger

    def _k(self, suffix: str) -> str:
        return f"octo:{self.tenant_id}:cb:{self.provider}:{self.model}:{suffix}"

    async def get_state(self) -> CircuitBreakerState:
        raw = await self.redis.get(self._k("state"))
        if raw is None:
            return CircuitBreakerState.CLOSED
        return CircuitBreakerState(raw)

    async def can_attempt(self) -> bool:
        st = await self.get_state()
        if st == CircuitBreakerState.CLOSED:
            return True
        if st == CircuitBreakerState.OPEN:
            return False
        probe_ok = await self.redis.set(self._k("half_open_probe"), "1", ex=10, nx=True)
        return bool(probe_ok)

    async def record_failure(self, error_code: str, retryable: bool) -> None:
        if not retryable:
            return
        cnt = await self.redis.incr(self._k("failures"))
        await self.redis.expire(self._k("failures"), self.config.window_seconds)
        if int(cnt) >= self.config.failure_threshold:
            await self.redis.set(self._k("state"), CircuitBreakerState.OPEN.value, ex=self.config.recovery_timeout_seconds)

    async def mark_half_open_if_recovery_elapsed(self) -> CircuitBreakerState:
        st = await self.get_state()
        if st == CircuitBreakerState.OPEN:
            return CircuitBreakerState.OPEN
        if st == CircuitBreakerState.CLOSED:
            await self.redis.set(self._k("state"), CircuitBreakerState.HALF_OPEN.value, ex=10)
            return CircuitBreakerState.HALF_OPEN
        return st

    async def record_success(self) -> None:
        await self.redis.delete(self._k("state"))
        await self.redis.delete(self._k("failures"))
        await self.redis.delete(self._k("half_open_probe"))
