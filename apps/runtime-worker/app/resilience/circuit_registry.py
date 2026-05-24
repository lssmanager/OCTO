from __future__ import annotations

from app.resilience.circuit_breaker import CircuitBreaker
from app.resilience.models import CircuitBreakerConfig, CircuitBreakerState, ModelCandidate


class CircuitBreakerRegistry:
    def __init__(self, redis: object, config: CircuitBreakerConfig, metrics: object | None = None, logger: object | None = None) -> None:
        self.redis = redis
        self.config = config
        self.metrics = metrics
        self.logger = logger
        self._cache: dict[str, CircuitBreaker] = {}

    def get(self, tenant_id: str, provider: str, model: str) -> CircuitBreaker:
        key = f"{tenant_id}:{provider}:{model}"
        if key not in self._cache:
            self._cache[key] = CircuitBreaker(tenant_id, provider, model, self.config, self.redis, self.metrics, self.logger)
        return self._cache[key]

    async def get_open_circuits(self, tenant_id: str, candidates: list[ModelCandidate]) -> set[str]:
        out: set[str] = set()
        for c in candidates:
            state = await self.get(tenant_id, c.provider, c.model).get_state()
            if state == CircuitBreakerState.OPEN:
                out.add(f"{c.provider}:{c.model}")
        return out
