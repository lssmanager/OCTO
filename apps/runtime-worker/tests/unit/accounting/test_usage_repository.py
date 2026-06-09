from __future__ import annotations

import json
from decimal import Decimal

import pytest

from app.accounting.models import (
    BudgetEvaluationResult,
    LLMStepAccounting,
    LLMUsageRecord,
    PromptCacheAccounting,
    ReasoningAccounting,
    RoutingAccounting,
    StructuredOutputAccounting,
)
from app.accounting.usage_repository import ExecutionUsageRepository


class _AsyncContext:
    def __init__(self, value: object) -> None:
        self._value = value

    async def __aenter__(self) -> object:
        return self._value

    async def __aexit__(self, exc_type, exc, tb) -> bool:
        return False


class FakeConnection:
    def __init__(self, *, fetchrow_result: dict[str, object] | None = None, update_result: str = 'UPDATE 1') -> None:
        self.fetchrow_result = fetchrow_result or {}
        self.update_result = update_result
        self.fetchrow_calls: list[tuple[str, tuple[object, ...]]] = []
        self.execute_calls: list[tuple[str, tuple[object, ...]]] = []

    async def fetchrow(self, query: str, *params: object) -> dict[str, object]:
        self.fetchrow_calls.append((query, params))
        return self.fetchrow_result

    async def execute(self, query: str, *params: object) -> str:
        self.execute_calls.append((query, params))
        if 'UPDATE execution_steps' in query:
            return self.update_result
        return 'INSERT 0 1'

    def transaction(self) -> _AsyncContext:
        return _AsyncContext(self)


class FakePool:
    def __init__(self, conn: FakeConnection) -> None:
        self._conn = conn

    def acquire(self) -> _AsyncContext:
        return _AsyncContext(self._conn)


def _accounting() -> LLMStepAccounting:
    return LLMStepAccounting(
        tenant_id='tenant-1',
        execution_id='exec-1',
        agent_id='agent-1',
        step_id='step-1',
        step_index=3,
        llm_call=LLMUsageRecord(
            provider='openai',
            model='openai/gpt-4.1-mini',
            input_tokens=10,
            output_tokens=5,
            total_tokens=15,
            estimated_cost_usd=Decimal('0.25'),
            latency_ms=120,
            prompt_cache=PromptCacheAccounting(cached_input_tokens=2, cache_hit=True),
            reasoning=ReasoningAccounting(enabled=True, reasoning_effort='medium', reasoning_tokens=4),
            structured_output=StructuredOutputAccounting(),
            routing=RoutingAccounting(
                primary_model='openai/gpt-4.1-mini',
                selected_model='openai/gpt-4.1-mini',
                selected_provider='openai',
            ),
        ),
        budget_snapshot_json={'snapshot_version': 2},
        budget_evaluation_before=BudgetEvaluationResult(
            allowed=True,
            outcome='allow',
            reason='ok',
        ),
    )


@pytest.mark.asyncio
async def test_get_execution_usage_reads_llm_accounting_from_output_json() -> None:
    conn = FakeConnection(
        fetchrow_result={
            'input_tokens': 10,
            'output_tokens': 5,
            'total_tokens': 15,
            'reasoning_tokens': 4,
            'cached_input_tokens': 2,
            'estimated_cost_usd': Decimal('0.25'),
        }
    )
    repo = ExecutionUsageRepository(FakePool(conn))

    usage = await repo.get_execution_usage(tenant_id='tenant-1', execution_id='exec-1')

    query, params = conn.fetchrow_calls[0]
    assert "output_json->'llm_call'" in query
    assert 'metadata_json' not in query
    assert params == ('tenant-1', 'exec-1')
    assert usage.total_tokens == 15
    assert usage.estimated_cost_usd == Decimal('0.25')


@pytest.mark.asyncio
async def test_persist_llm_step_accounting_updates_existing_step_columns() -> None:
    conn = FakeConnection(update_result='UPDATE 1')
    repo = ExecutionUsageRepository(FakePool(conn))

    await repo.persist_llm_step_accounting(
        accounting=_accounting(),
        expected_execution_version=7,
    )

    update_query, update_params = conn.execute_calls[0]
    outbox_query, outbox_params = conn.execute_calls[1]
    assert 'UPDATE execution_steps' in update_query
    assert 'metadata_json' not in update_query
    assert 'from_state' not in update_query
    assert 'to_state' not in update_query

    persisted_step_output = json.loads(update_params[3])
    assert persisted_step_output['llm_call']['total_tokens'] == 15
    assert persisted_step_output['budget']['expected_execution_version'] == 7

    assert 'INSERT INTO outbox_events' in outbox_query
    persisted_event = json.loads(outbox_params[2])
    assert persisted_event['step_id'] == 'step-1'
    assert persisted_event['expected_execution_version'] == 7


@pytest.mark.asyncio
async def test_persist_llm_step_accounting_inserts_step_when_runtime_row_is_missing() -> None:
    conn = FakeConnection(update_result='UPDATE 0')
    repo = ExecutionUsageRepository(FakePool(conn))

    await repo.persist_llm_step_accounting(
        accounting=_accounting(),
        expected_execution_version=3,
    )

    assert len(conn.execute_calls) == 3
    _, insert_params = conn.execute_calls[1]
    inserted_step_output = json.loads(insert_params[4])
    assert inserted_step_output['budget']['expected_execution_version'] == 3
