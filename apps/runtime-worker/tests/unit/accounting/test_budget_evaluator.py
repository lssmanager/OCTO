from __future__ import annotations

from decimal import Decimal

import pytest

from app.accounting.budget_evaluator import BudgetEvaluator
from app.accounting.cost_calculator import CostCalculator
from app.accounting.models import BudgetPolicySnapshot, ExecutionUsageAggregate


class Repo:
    def __init__(self, spend: str) -> None:
        self.spend = Decimal(spend)

    async def get_execution_usage(self, *, tenant_id: str, execution_id: str) -> ExecutionUsageAggregate:
        return ExecutionUsageAggregate(estimated_cost_usd=self.spend)


@pytest.mark.asyncio
async def test_budget_allow() -> None:
    ev = BudgetEvaluator(Repo("0.1"), CostCalculator())
    r = await ev.evaluate_before_call(
        tenant_id="t", execution_id="e", selected_model="openai/gpt-4.1-mini", max_output_tokens=100,
        reasoning_effort="none", prompt_cache_expected=False, budget_snapshot=BudgetPolicySnapshot(max_usd_per_run=Decimal("1.0"))
    )
    assert r.allowed


@pytest.mark.asyncio
async def test_budget_fail() -> None:
    ev = BudgetEvaluator(Repo("0.99"), CostCalculator())
    r = await ev.evaluate_before_call(
        tenant_id="t", execution_id="e", selected_model="openai/gpt-4.1-mini", max_output_tokens=100000,
        reasoning_effort="high", prompt_cache_expected=False, budget_snapshot=BudgetPolicySnapshot(max_usd_per_run=Decimal("1.0"), on_exhaust="fail")
    )
    assert not r.allowed and r.outcome == "fail"
