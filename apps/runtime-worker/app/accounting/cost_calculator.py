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
