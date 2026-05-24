import pytest

from app.retry.poison_detector import PoisonDetector
from app.retry.policy import ErrorClass


class FakeRedis:
    def __init__(self):
        self.store = {}
        self.expires = {}

    async def incr(self, key):
        self.store[key] = int(self.store.get(key, 0)) + 1
        return self.store[key]

    async def expire(self, key, ttl):
        self.expires[key] = ttl

    async def set(self, key, value, ex=None):
        self.store[key] = value
        self.expires[key] = ex

    async def get(self, key):
        return self.store.get(key)


class FakeMetrics:
    def __init__(self):
        self.calls = []

    def inc(self, name, labels):
        self.calls.append((name, labels))


@pytest.mark.asyncio
async def test_third_same_signature_is_poison() -> None:
    r = FakeRedis(); m = FakeMetrics(); d = PoisonDetector(r, metrics=m)
    await d.record_failure('t', 'e', 1, 'ERR', ErrorClass.RUNTIME_TRANSIENT)
    await d.record_failure('t', 'e', 1, 'ERR', ErrorClass.RUNTIME_TRANSIENT)
    assert not await d.is_poison('t', 'e', 1, 'ERR')
    await d.record_failure('t', 'e', 1, 'ERR', ErrorClass.RUNTIME_TRANSIENT)
    assert await d.is_poison('t', 'e', 1, 'ERR')


@pytest.mark.asyncio
async def test_invariant_within_window_poison() -> None:
    r = FakeRedis(); d = PoisonDetector(r)
    await d.record_failure('t', 'e', 1, 'INV', ErrorClass.INVARIANT_BREACH)
    assert await d.is_poison('t', 'e', 1, 'INV', ErrorClass.INVARIANT_BREACH)


@pytest.mark.asyncio
async def test_reclaim_count_poison() -> None:
    d = PoisonDetector(FakeRedis())
    assert await d.is_poison('t', 'e', 1, 'X', reclaim_count=3, max_reclaims=3)


def test_redis_key_tenant_scoped() -> None:
    key = PoisonDetector._key('tenantA', 'e', 1, 'ERR')
    assert key.startswith('octo:tenantA:poison:') and 'octo:poison' not in key
