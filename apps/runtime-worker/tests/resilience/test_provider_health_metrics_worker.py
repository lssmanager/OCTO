from __future__ import annotations

import json

import pytest

from app.resilience.models import ModelCandidate
from app.resilience.provider_health_repository import ProviderHealthRepository
from app.resilience.provider_metrics_collector import ProviderMetricsCollector
from app.workers.provider_health_metrics_worker import ProviderHealthMetricsWorker, ProviderHealthWorkerConfig


class FakeRedis:
    def __init__(self) -> None:
        self.d: dict[str, str] = {}

    async def set(self, k: str, v, ex=None, nx=False):
        if nx and k in self.d:
            return False
        self.d[k] = str(v)
        return True

    async def get(self, k: str):
        return self.d.get(k)


class FakeProm:
    async def collect(self):
        return [{"tenant_id": "t1", "provider": "openai", "model": "openai/gpt-4.1-mini", "observed_latency_ms_p50": 100, "observed_latency_ms_p95": 200, "recent_error_rate": 0.1, "requests_per_minute": 9, "in_flight_requests": 2, "cache_hit_rate": 0.5}]


@pytest.mark.asyncio
async def test_worker_writes_health_snapshot() -> None:
    redis = FakeRedis()
    w = ProviderHealthMetricsWorker(redis, FakeProm(), None, ProviderHealthWorkerConfig())
    await w.run_once()
    keys = [k for k in redis.d if k.startswith("octo:t1:provider_health:")]
    assert keys
    payload = json.loads(redis.d[keys[0]])
    assert payload["observed_latency_ms_p95"] == 200


@pytest.mark.asyncio
async def test_collector_reads_snapshot() -> None:
    redis = FakeRedis()
    await ProviderHealthMetricsWorker(redis, FakeProm(), None, ProviderHealthWorkerConfig()).run_once()
    collector = ProviderMetricsCollector(ProviderHealthRepository(redis))
    cands = [ModelCandidate(model="openai/gpt-4.1-mini", provider="openai", source_level="agent", priority=0)]
    out = await collector.enrich_candidates("t1", cands)
    assert out[0].observed_latency_ms_p50 == 100
