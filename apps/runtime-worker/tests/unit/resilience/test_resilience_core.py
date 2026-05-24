from __future__ import annotations

from decimal import Decimal

import pytest

from app.resilience import (
    CircuitBreaker,
    CircuitBreakerRegistry,
    FallbackChainResolver,
    ModelCapabilityMatcher,
    RoutingStrategySelector,
    TokenBucketRateLimiter,
)
from app.resilience.models import CircuitBreakerConfig, CircuitBreakerState, ModelCapabilityRequirements, RoutingStrategy


class FakeRedis:
    def __init__(self) -> None:
        self.d: dict[str, str] = {}

    async def get(self, k: str):
        return self.d.get(k)

    async def set(self, k: str, v, ex=None, nx=False):
        if nx and k in self.d:
            return False
        self.d[k] = str(v)
        return True

    async def incr(self, k: str):
        self.d[k] = str(int(self.d.get(k, "0")) + 1)
        return int(self.d[k])

    async def expire(self, k: str, t: int):
        return True

    async def delete(self, k: str):
        self.d.pop(k, None)


@pytest.mark.asyncio
async def test_circuit_open_after_threshold() -> None:
    r = FakeRedis()
    cb = CircuitBreaker("tenantA", "openai", "openai/gpt-4", CircuitBreakerConfig(failure_threshold=2), r)
    await cb.record_failure("LLM_TIMEOUT", True)
    await cb.record_failure("LLM_TIMEOUT", True)
    assert await cb.get_state() == CircuitBreakerState.OPEN


def test_resolver_prefers_agent() -> None:
    resolver = FallbackChainResolver()
    hs = {"agent": {"model_policy": {"primary_model": "openai/gpt-4", "fallback_models": ["anthropic/haiku"]}}, "workspace": {"model_policy": {"primary_model": "gemini/flash"}}}
    out = resolver.resolve(hs, set(), ModelCapabilityRequirements(), "openai/gpt-4-mini")
    assert out[0].model == "openai/gpt-4"


@pytest.mark.asyncio
async def test_rate_limiter_tenant_scoped() -> None:
    rl = TokenBucketRateLimiter(FakeRedis())
    ok = await rl.acquire("tenantA", "openai/gpt-4", 5, 10, 1.0)
    assert ok


@pytest.mark.asyncio
async def test_routing_cost_based() -> None:
    resolver = FallbackChainResolver()
    hs = {"agent": {"model_policy": {"primary_model": "openai/gpt-4", "fallback_models": ["anthropic/haiku"]}}}
    cands = resolver.resolve(hs, set(), ModelCapabilityRequirements(), "openai/gpt-4-mini")
    cands[0].estimated_cost_usd_per_1k_input = Decimal("10")
    cands[1].estimated_cost_usd_per_1k_input = Decimal("1")
    dec = await RoutingStrategySelector().select("tenantA", cands, RoutingStrategy.COST_BASED, ModelCapabilityRequirements(), Decimal("1"))
    assert dec.selected_model == "anthropic/haiku"


def test_registry_tenant_keyed() -> None:
    reg = CircuitBreakerRegistry(FakeRedis(), CircuitBreakerConfig())
    a = reg.get("t1", "openai", "m")
    b = reg.get("t2", "openai", "m")
    assert a is not b


def test_capability_matcher_reasoning() -> None:
    cands = FallbackChainResolver().resolve({"agent": {"model_policy": {"primary_model": "openai/gpt-4"}}}, set(), ModelCapabilityRequirements(), "openai/gpt")
    c = cands[0]
    c.supports_reasoning = False
    ok, reason = ModelCapabilityMatcher().is_compatible(c, ModelCapabilityRequirements(requires_reasoning=True))
    assert not ok and reason == "missing_reasoning_support"
