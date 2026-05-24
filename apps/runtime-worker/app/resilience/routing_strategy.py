from __future__ import annotations

from decimal import Decimal

from app.resilience.models import ModelCandidate, ModelCapabilityRequirements, RoutingDecision, RoutingStrategy


class RoutingStrategySelector:
    async def select(self, tenant_id: str, candidates: list[ModelCandidate], strategy: RoutingStrategy, requirements: ModelCapabilityRequirements, budget_remaining_usd: Decimal | None) -> RoutingDecision:
        chosen = candidates[0]
        reason = "default_first"
        if strategy == RoutingStrategy.LEAST_BUSY:
            chosen = sorted(candidates, key=lambda c: ((c.recent_error_rate or 0.0) * 0.15 + (c.observed_latency_ms_p50 or 1000)/1000*0.10 - c.cache_affinity_score*0.05))[0]
            reason = "least_busy"
        elif strategy == RoutingStrategy.COST_BASED:
            chosen = sorted(candidates, key=lambda c: c.estimated_cost_usd_per_1k_input or Decimal("999"))[0]
            reason = "cost_based"
        elif strategy == RoutingStrategy.LATENCY_BASED:
            chosen = sorted(candidates, key=lambda c: c.observed_latency_ms_p50 or 10**9)[0]
            reason = "latency_based"
        return RoutingDecision(selected_model=chosen.model, selected_provider=chosen.provider, routing_strategy=strategy, routing_reason=reason, primary_model=candidates[0].model)
