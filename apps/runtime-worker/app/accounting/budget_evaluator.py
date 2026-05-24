from __future__ import annotations

from app.accounting.cost_calculator import CostCalculator
from app.accounting.models import BudgetEvaluationResult, BudgetPolicySnapshot, ExecutionUsageAggregate


class BudgetEvaluator:
    def __init__(self, usage_repo: object, cost_calculator: CostCalculator) -> None:
        self.usage_repo = usage_repo
        self.cost_calculator = cost_calculator

    async def evaluate_before_call(
        self,
        *,
        tenant_id: str,
        execution_id: str,
        selected_model: str,
        max_output_tokens: int,
        reasoning_effort: str,
        prompt_cache_expected: bool,
        budget_snapshot: BudgetPolicySnapshot,
    ) -> BudgetEvaluationResult:
        cumulative: ExecutionUsageAggregate = await self.usage_repo.get_execution_usage(tenant_id=tenant_id, execution_id=execution_id)
        projected = self.cost_calculator.estimate_minimum_call_cost(
            model=selected_model,
            max_output_tokens=max_output_tokens,
            reasoning_effort=reasoning_effort,
            prompt_cache_expected=prompt_cache_expected,
            min_reserved_cost_usd=budget_snapshot.min_reserved_cost_usd,
        )
        remaining = None
        if budget_snapshot.max_usd_per_run is not None:
            remaining = budget_snapshot.max_usd_per_run - cumulative.estimated_cost_usd
            if remaining < projected:
                outcome = "pause_for_approval" if budget_snapshot.on_exhaust == "pause_for_approval" else "fail"
                return BudgetEvaluationResult(
                    allowed=False,
                    outcome=outcome,
                    reason="LLM_BUDGET_EXCEEDED",
                    remaining_budget_usd=remaining,
                    projected_cost_usd=projected,
                    current_spend_usd=cumulative.estimated_cost_usd,
                )
        return BudgetEvaluationResult(
            allowed=True,
            outcome="allow",
            reason="budget_available",
            remaining_budget_usd=remaining,
            projected_cost_usd=projected,
            current_spend_usd=cumulative.estimated_cost_usd,
        )
