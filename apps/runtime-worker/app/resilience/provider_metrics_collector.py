from __future__ import annotations

from app.resilience.models import ModelCandidate
from app.resilience.provider_health_repository import ProviderHealthRepository


class ProviderMetricsCollector:
    def __init__(self, health_repo: ProviderHealthRepository) -> None:
        self.health_repo = health_repo

    async def enrich_candidates(self, tenant_id: str, candidates: list[ModelCandidate]) -> list[ModelCandidate]:
        out: list[ModelCandidate] = []
        for c in candidates:
            h = await self.health_repo.get(tenant_id, c.provider, c.model)
            if h:
                c.observed_latency_ms_p50 = h.get("observed_latency_ms_p50")
                c.recent_error_rate = h.get("recent_error_rate")
                c.cache_affinity_score = h.get("cache_affinity_score", c.cache_affinity_score)
            out.append(c)
        return out
