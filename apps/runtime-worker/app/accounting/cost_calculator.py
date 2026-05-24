from __future__ import annotations

from decimal import Decimal


class CostCalculator:
    def estimate_minimum_call_cost(
        self,
        *,
        model: str,
        max_output_tokens: int,
        reasoning_effort: str,
        prompt_cache_expected: bool,
        min_reserved_cost_usd: Decimal,
    ) -> Decimal:
        base = min_reserved_cost_usd
        variable = Decimal(max_output_tokens) * Decimal("0.0000005")
        if reasoning_effort in {"medium", "high"}:
            variable += Decimal("0.00005")
        if prompt_cache_expected:
            variable *= Decimal("0.8")
        return base + variable


from pydantic import BaseModel

class ModelPricing(BaseModel):
    model: str
    input_cost_per_1m_tokens: Decimal
    output_cost_per_1m_tokens: Decimal
    cached_input_cost_per_1m_tokens: Decimal | None = None


def calculate_cache_savings(model: str, cached_input_tokens: int, pricing: ModelPricing) -> Decimal:
    if cached_input_tokens <= 0:
        return Decimal("0")
    input_per_token = pricing.input_cost_per_1m_tokens / Decimal(1_000_000)
    if pricing.cached_input_cost_per_1m_tokens is not None:
        cached_per_token = pricing.cached_input_cost_per_1m_tokens / Decimal(1_000_000)
        savings = (input_per_token - cached_per_token) * Decimal(cached_input_tokens)
    else:
        savings = input_per_token * Decimal(cached_input_tokens) * Decimal("0.5")
    return savings if savings > Decimal("0") else Decimal("0")
