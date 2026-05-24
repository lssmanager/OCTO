from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime


@dataclass
class ProviderHealthWorkerConfig:
    provider_health_refresh_seconds: int = 60
    provider_health_redis_ttl_seconds: int = 180
    provider_health_query_timeout_ms: int = 5000


class ProviderHealthMetricsWorker:
    def __init__(self, redis: object, prometheus_client: object | None, litellm_metrics_client: object | None, config: ProviderHealthWorkerConfig, logger: object | None = None, metrics: object | None = None, worker_id: str = "runtime-worker") -> None:
        self.redis = redis
        self.prometheus_client = prometheus_client
        self.litellm_metrics_client = litellm_metrics_client
        self.config = config
        self.logger = logger
        self.metrics = metrics
        self.worker_id = worker_id

    async def run_once(self) -> None:
        lock = await self.redis.set("octo:infra:provider_health_worker:lock", self.worker_id, ex=55, nx=True)
        if not lock:
            return
        if self.prometheus_client is None:
            if self.logger is not None:
                self.logger.warning("provider_health_metrics_unconfigured")
            return
        rows = await self.prometheus_client.collect()
        for row in rows:
            key = f"octo:{row['tenant_id']}:provider_health:{row['provider'].replace('/','_')}:{row['model'].replace('/','_')}"
            payload = {
                "provider": row["provider"],
                "model": row["model"],
                "observed_latency_ms_p50": row.get("observed_latency_ms_p50"),
                "observed_latency_ms_p95": row.get("observed_latency_ms_p95"),
                "recent_error_rate": row.get("recent_error_rate", 0.0),
                "requests_per_minute": row.get("requests_per_minute", 0),
                "in_flight_requests": row.get("in_flight_requests", 0),
                "rate_limit_block_count": row.get("rate_limit_block_count", 0),
                "cache_hit_rate": row.get("cache_hit_rate", 0.0),
                "cache_affinity_score": row.get("cache_hit_rate", 0.0),
                "circuit_state": row.get("circuit_state", "CLOSED"),
                "source": "prometheus",
                "updated_at": datetime.now(UTC).isoformat(),
                "ttl_seconds": self.config.provider_health_redis_ttl_seconds,
            }
            await self.redis.set(key, json.dumps(payload), ex=self.config.provider_health_redis_ttl_seconds)

    async def run_forever(self) -> None:
        import asyncio
        while True:
            await self.run_once()
            await asyncio.sleep(self.config.provider_health_refresh_seconds)
