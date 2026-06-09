from __future__ import annotations

import json

from app.accounting.models import ExecutionUsageAggregate, LLMStepAccounting


class ExecutionUsageRepository:
    def __init__(self, pool: object) -> None:
        self.pool = pool

    async def get_execution_usage(self, *, tenant_id: str, execution_id: str) -> ExecutionUsageAggregate:
        async with self.pool.acquire() as conn:
            row = await conn.fetchrow(
                """
                SELECT
                  COALESCE(SUM((output_json->'llm_call'->>'input_tokens')::int),0) as input_tokens,
                  COALESCE(SUM((output_json->'llm_call'->>'output_tokens')::int),0) as output_tokens,
                  COALESCE(SUM((output_json->'llm_call'->>'total_tokens')::int),0) as total_tokens,
                  COALESCE(SUM((output_json->'llm_call'->>'reasoning_tokens')::int),0) as reasoning_tokens,
                  COALESCE(SUM((output_json->'llm_call'->>'cached_input_tokens')::int),0) as cached_input_tokens,
                  COALESCE(SUM((output_json->'llm_call'->>'estimated_cost_usd')::numeric),0) as estimated_cost_usd
                FROM execution_steps
                WHERE tenant_id=$1 AND execution_id=$2
                """,
                tenant_id,
                execution_id,
            )
        return ExecutionUsageAggregate(**dict(row))

    async def persist_llm_step_accounting(
        self, *, accounting: LLMStepAccounting, expected_execution_version: int
    ) -> None:
        step_output_json = {
            "llm_call": accounting.llm_call.model_dump(mode="json"),
            "budget": {
                "budget_snapshot_version": accounting.budget_snapshot_json.get("snapshot_version", 1),
                "precheck_outcome": accounting.budget_evaluation_before.outcome,
                "expected_execution_version": expected_execution_version,
            },
        }
        outbox_payload = {
            "execution_id": accounting.execution_id,
            "agent_id": accounting.agent_id,
            "step_id": accounting.step_id,
            "step_index": accounting.step_index,
            "provider": accounting.llm_call.provider,
            "model": accounting.llm_call.model,
            "input_tokens": accounting.llm_call.input_tokens,
            "output_tokens": accounting.llm_call.output_tokens,
            "total_tokens": accounting.llm_call.total_tokens,
            "reasoning_tokens": accounting.llm_call.reasoning.reasoning_tokens,
            "cached_input_tokens": accounting.llm_call.prompt_cache.cached_input_tokens,
            "estimated_cost_usd": str(accounting.llm_call.estimated_cost_usd),
            "routing_strategy": accounting.llm_call.routing.routing_strategy,
            "fallback_level": accounting.llm_call.routing.fallback_level,
            "expected_execution_version": expected_execution_version,
        }

        async with self.pool.acquire() as conn:
            async with conn.transaction():
                updated = await conn.execute(
                    """
                    UPDATE execution_steps
                    SET step_type='llm_call',
                        state_from=COALESCE(state_from, 'running'),
                        state_to=COALESCE(state_to, 'completed'),
                        output_json=COALESCE(output_json, '{}'::jsonb) || $4::jsonb
                    WHERE id=$1 AND execution_id=$2 AND tenant_id=$3
                    """,
                    accounting.step_id,
                    accounting.execution_id,
                    accounting.tenant_id,
                    json.dumps(step_output_json),
                )
                if updated.endswith("0"):
                    await conn.execute(
                        """
                        INSERT INTO execution_steps (
                          id, execution_id, tenant_id, step_index, step_type, status,
                          state_from, state_to, output_json, started_at, ended_at, completed_at
                        ) VALUES ($1,$2,$3,$4,'llm_call','completed','running','completed',$5::jsonb,now(),now(),now())
                        """,
                        accounting.step_id,
                        accounting.execution_id,
                        accounting.tenant_id,
                        accounting.step_index,
                        json.dumps(step_output_json),
                    )
                await conn.execute(
                    """
                    INSERT INTO outbox_events (
                      id, tenant_id, aggregate_type, aggregate_id, event_type, sequence, payload_json
                    ) VALUES (
                      gen_random_uuid()::text,
                      $1,
                      'Execution',
                      $2,
                      'LLMUsageRecorded',
                      (
                        SELECT COALESCE(MAX(sequence),0)+1
                        FROM outbox_events
                        WHERE tenant_id=$1 AND aggregate_type='Execution' AND aggregate_id=$2
                      ),
                      $3::jsonb
                    )
                    """,
                    accounting.tenant_id,
                    accounting.execution_id,
                    json.dumps(outbox_payload),
                )
