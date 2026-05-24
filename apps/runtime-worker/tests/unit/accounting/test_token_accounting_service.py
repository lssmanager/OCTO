from __future__ import annotations

from decimal import Decimal

from app.accounting.models import BudgetEvaluationResult
from app.accounting.token_accounting_service import TokenAccountingService
from app.contracts.llm import CanonicalChatMessage, ChatCompletionRequest, ChatCompletionResponse, ChatUsage, PromptCachePolicy


def test_build_from_response() -> None:
    svc = TokenAccountingService()
    req = ChatCompletionRequest(
        tenant_id="t", execution_id="e", agent_id="a", model="openai/gpt-4.1-mini",
        messages=[CanonicalChatMessage(role="user", content="hi")],
        prompt_cache=PromptCachePolicy(enabled=True, cache_key="abc"), reasoning_effort="medium", output_schema={"type": "object"}
    )
    res = ChatCompletionResponse(
        id="r", content="{}", finish_reason="stop",
        usage=ChatUsage(input_tokens=10, output_tokens=5, total_tokens=15, reasoning_tokens=2, cached_input_tokens=3, provider="openai", model="openai/gpt-4.1-mini", estimated_cost_usd=Decimal("0.01")),
        raw={}
    )
    out = svc.build_from_response(
        req=req, response=res, latency_ms=123, step_id="s1", step_index=1,
        budget_snapshot_json={"snapshot_version": 1}, budget_before=BudgetEvaluationResult(allowed=True, outcome="allow", reason="ok")
    )
    assert out.llm_call.prompt_cache.cache_hit
    assert out.llm_call.reasoning.reasoning_tokens == 2
    assert str(out.llm_call.estimated_cost_usd) == "0.01"
