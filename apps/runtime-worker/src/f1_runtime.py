from __future__ import annotations

import json
import os
import uuid
from typing import Any

import asyncpg
import structlog

from .fsm_contract import validate_transition
from .llm_provider import LLMCallResult, call_llm
from .reclaim_lineage import validate_checkpoint_lineage
from .tools.executor import execute_tool_call

log = structlog.get_logger(__name__)


async def _next_outbox_sequence(conn: asyncpg.Connection, tenant_id: str, execution_id: str) -> int:
    value = await conn.fetchval(
        """
        SELECT COALESCE(MAX(sequence), 0) + 1
        FROM outbox_events
        WHERE tenant_id=$1 AND aggregate_type='execution' AND aggregate_id=$2
        """,
        tenant_id,
        execution_id,
    )
    return int(value or 1)


def _json(value: Any) -> str:
    return json.dumps(value)


async def _insert_outbox(
    conn: asyncpg.Connection,
    *,
    tenant_id: str,
    execution_id: str,
    event_type: str,
    payload: dict[str, Any],
) -> None:
    seq = await _next_outbox_sequence(conn, tenant_id, execution_id)
    await conn.execute(
        """
        INSERT INTO outbox_events (
          id, tenant_id, aggregate_type, aggregate_id, event_type, sequence, payload_json
        ) VALUES ($1,$2,'execution',$3,$4,$5,$6::jsonb)
        """,
        str(uuid.uuid4()),
        tenant_id,
        execution_id,
        event_type,
        seq,
        _json(payload),
    )


async def _mark_failed(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    error_code: str,
    error_message: str,
    trace_id: str | None,
) -> None:
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT status FROM executions WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
            execution_id,
            tenant_id,
        )
        if row is None:
            return
        current_status = str(row["status"])
        if current_status not in {"completed", "failed", "cancelled"}:
            validate_transition(current_status, "failed")
            await conn.execute(
                """
                UPDATE executions
                SET status='failed', state='failed', version=version+1,
                    error_code=$3, error_message=$4,
                    error=$5::jsonb, updated_at=now(), completed_at=now()
                WHERE id=$1 AND tenant_id=$2 AND status=$6
                """,
                execution_id,
                tenant_id,
                error_code,
                error_message,
                _json({"code": error_code, "message": error_message, "retryable": True}),
                current_status,
            )
            await _insert_outbox(
                conn,
                tenant_id=tenant_id,
                execution_id=execution_id,
                event_type="ExecutionFailed",
                payload={
                    "executionId": execution_id,
                    "traceId": trace_id,
                    "errorCode": error_code,
                    "errorMessage": error_message,
                },
            )


async def _claim_and_start(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    trace_id: str | None,
    mode: str,
) -> dict[str, Any] | None:
    worker_id = os.environ.get("HOSTNAME", "runtime-worker")
    fake = os.environ.get("OCTO_TEST_LLM_FAKE", "false").lower() == "true"

    async with conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT id, status, state, version, input_json, context_snapshot_json, agent_id
            FROM executions
            WHERE id=$1 AND tenant_id=$2
            FOR UPDATE
            """,
            execution_id,
            tenant_id,
        )
        if row is None:
            raise RuntimeError("execution_not_found")

        status = str(row["status"])
        if mode == "reclaim":
            cps = await conn.fetch(
                """
                SELECT id, step_index, parent_checkpoint_id, state_json
                FROM execution_checkpoints
                WHERE execution_id=$1 AND tenant_id=$2
                ORDER BY step_index ASC
                """,
                execution_id,
                tenant_id,
            )
            if not validate_checkpoint_lineage([dict(r) for r in cps]):
                if status not in {"completed", "failed", "cancelled"}:
                    validate_transition(status, "failed")
                    await conn.execute(
                        """
                        UPDATE executions
                        SET status='failed', state='failed', version=version+1,
                            error_code='CHECKPOINT_LINEAGE_BROKEN',
                            error_message='checkpoint lineage invalid',
                            updated_at=now(), completed_at=now()
                        WHERE id=$1 AND tenant_id=$2 AND status=$3
                        """,
                        execution_id,
                        tenant_id,
                        status,
                    )
                    await _insert_outbox(
                        conn,
                        tenant_id=tenant_id,
                        execution_id=execution_id,
                        event_type="ExecutionFailed",
                        payload={
                            "executionId": execution_id,
                            "traceId": trace_id,
                            "errorCode": "CHECKPOINT_LINEAGE_BROKEN",
                        },
                    )
                return {"status": "failed", "error": "CHECKPOINT_LINEAGE_BROKEN"}

        if status != "dispatched":
            log.info(
                "execution.f1_runtime_skipped",
                execution_id=execution_id,
                tenant_id=tenant_id,
                status=status,
                legacy_state=row["state"],
            )
            return None

        validate_transition(status, "running")
        updated = await conn.fetchrow(
            """
            UPDATE executions
            SET status='running', state='running', version=version+1,
                started_at=COALESCE(started_at, now()), updated_at=now(), worker_id=$4
            WHERE id=$1 AND tenant_id=$2 AND status='dispatched' AND version=$3
            RETURNING version
            """,
            execution_id,
            tenant_id,
            row["version"],
            worker_id,
        )
        if updated is None:
            return {"status": "cas_conflict"}

        cp0 = str(uuid.uuid4())
        input_json = row["input_json"] or {}
        context_snapshot = row["context_snapshot_json"] or {}
        await conn.execute(
            """
            INSERT INTO execution_checkpoints (
              id, tenant_id, execution_id, step_index, source, parent_checkpoint_id,
              state_json, metadata_json, channel_versions, versions_seen, worker_id, schema_version
            ) VALUES ($1,$2,$3,0,'input',NULL,$4::jsonb,$5::jsonb,'{}'::jsonb,'{}'::jsonb,$6,1)
            """,
            cp0,
            tenant_id,
            execution_id,
            _json({"messages": [{"role": "user", "content": str(input_json)}]}),
            _json({"checkpoint_schema_version": 1}),
            worker_id,
        )
        llm_step_id = str(uuid.uuid4())
        await conn.execute(
            """
            INSERT INTO execution_steps (
              id, tenant_id, execution_id, step_index, step_type, status,
              state_from, state_to, input_json, output_json, started_at
            ) VALUES ($1,$2,$3,1,'llm_call','running','dispatched','running',$4::jsonb,$5::jsonb,now())
            """,
            llm_step_id,
            tenant_id,
            execution_id,
            _json({"provider": "fake" if fake else "litellm"}),
            _json({}),
        )
        await _insert_outbox(
            conn,
            tenant_id=tenant_id,
            execution_id=execution_id,
            event_type="ExecutionStarted",
            payload={"executionId": execution_id, "traceId": trace_id},
        )

        return {
            "input_json": input_json,
            "context_snapshot_json": context_snapshot,
            "agent_id": row["agent_id"],
            "checkpoint_id": cp0,
            "llm_step_id": llm_step_id,
        }


async def _run_llm_and_tools(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    trace_id: str | None,
    started: dict[str, Any],
) -> tuple[str, LLMCallResult, list[tuple[str, str, str, str, str, int, str, str, str]]]:
    messages = [{"role": "user", "content": str(started["input_json"])}]
    snapshot = started["context_snapshot_json"] or {}
    agent_id = str(started["agent_id"])
    checkpoint_writes_buffer: list[tuple[str, str, str, str, str, int, str, str, str]] = []

    llm = await call_llm(
        tenant_id=tenant_id,
        execution_id=execution_id,
        agent_id=agent_id,
        messages=messages,
        snapshot=snapshot,
    )
    if llm.tool_calls:
        messages.append({"role": "assistant", "content": "", "tool_calls": llm.tool_calls})
        for idx, tc in enumerate(llm.tool_calls):
            tool_res = await execute_tool_call(
                conn,
                tenant_id=tenant_id,
                execution_id=execution_id,
                step_id=started["llm_step_id"],
                step_index=idx + 2,
                tool_call=tc,
                trace_id=trace_id,
            )
            checkpoint_writes_buffer.append((
                str(uuid.uuid4()),
                tenant_id,
                started["checkpoint_id"],
                execution_id,
                "tool",
                idx,
                "messages",
                "tool_result",
                _json(tool_res),
            ))
            messages.append({"role": "tool", "content": _json(tool_res), "tool_call_id": tc.get("id")})
        llm2 = await call_llm(
            tenant_id=tenant_id,
            execution_id=execution_id,
            agent_id=agent_id,
            messages=messages,
            snapshot=snapshot,
        )
        return llm2.content, llm2, checkpoint_writes_buffer
    return llm.content, llm, checkpoint_writes_buffer


async def _persist_success(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    trace_id: str | None,
    started: dict[str, Any],
    output: str,
    llm: LLMCallResult,
    checkpoint_writes_buffer: list[tuple[str, str, str, str, str, int, str, str, str]],
) -> None:
    worker_id = os.environ.get("HOSTNAME", "runtime-worker")
    async with conn.transaction():
        row = await conn.fetchrow(
            "SELECT status FROM executions WHERE id=$1 AND tenant_id=$2 FOR UPDATE",
            execution_id,
            tenant_id,
        )
        if row is None:
            raise RuntimeError("execution_not_found")
        current_status = str(row["status"])
        validate_transition(current_status, "completed")

        for write_data in checkpoint_writes_buffer:
            await conn.execute(
                """
                INSERT INTO execution_checkpoint_writes (
                  id, tenant_id, checkpoint_id, task_id, task_path, write_index, channel, type, value_json
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
                """,
                *write_data,
            )

        await conn.execute(
            """
            UPDATE execution_steps
            SET status='completed', output_json=$4::jsonb, ended_at=now(), completed_at=now()
            WHERE id=$1 AND tenant_id=$2 AND execution_id=$3
            """,
            started["llm_step_id"],
            tenant_id,
            execution_id,
            _json(
                {
                    "llm_call": {
                        "provider": llm.provider,
                        "model": llm.model,
                        "input_tokens": llm.usage.get("input_tokens", 0),
                        "output_tokens": llm.usage.get("output_tokens", 0),
                        "total_tokens": llm.usage.get("total_tokens", 0),
                        "estimated_cost_usd": str(llm.usage.get("estimated_cost_usd", "0")),
                        "latency_ms": llm.usage.get("latency_ms", 0),
                        "retry_count": llm.retry_count,
                        "fallback_level": llm.fallback_level,
                        "accounting_error": llm.accounting_error,
                    }
                }
            ),
        )
        cp1 = str(uuid.uuid4())
        await conn.execute(
            """
            INSERT INTO execution_checkpoints (
              id, tenant_id, execution_id, step_index, source, parent_checkpoint_id,
              state_json, metadata_json, channel_versions, versions_seen, worker_id, schema_version
            ) VALUES ($1,$2,$3,2,'loop',$4,$5::jsonb,$6::jsonb,'{}'::jsonb,'{}'::jsonb,$7,1)
            """,
            cp1,
            tenant_id,
            execution_id,
            started["checkpoint_id"],
            _json({"messages": [{"role": "assistant", "content": output}]}),
            _json({"checkpoint_schema_version": 1}),
            worker_id,
        )
        await conn.execute(
            """
            UPDATE executions
            SET status='completed', state='completed', version=version+1,
                result=$4::jsonb, output_json=$4::jsonb, completed_at=now(),
                updated_at=now(), last_checkpoint_id=$3,
                token_usage=$5::jsonb
            WHERE id=$1 AND tenant_id=$2 AND status='running'
            """,
            execution_id,
            tenant_id,
            cp1,
            _json({"output": output}),
            _json(llm.usage),
        )
        await _insert_outbox(
            conn,
            tenant_id=tenant_id,
            execution_id=execution_id,
            event_type="ExecutionCheckpointed",
            payload={"executionId": execution_id, "checkpointId": cp1, "traceId": trace_id},
        )
        await _insert_outbox(
            conn,
            tenant_id=tenant_id,
            execution_id=execution_id,
            event_type="ExecutionSucceeded",
            payload={"executionId": execution_id, "output": output, "traceId": trace_id},
        )


async def run_f1_execution(
    execution_id: str,
    tenant_id: str,
    trace_id: str | None = None,
    mode: str = "normal",
) -> dict[str, Any]:
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("DATABASE_URL required")

    conn = await asyncpg.connect(dsn)
    try:
        started = await _claim_and_start(
            conn,
            execution_id=execution_id,
            tenant_id=tenant_id,
            trace_id=trace_id,
            mode=mode,
        )
        if started is None:
            return {"status": "skipped", "reason": "not_dispatched"}
        if started.get("status") in {"cas_conflict", "failed"}:
            return started

        try:
            output, llm, checkpoint_writes_buffer = await _run_llm_and_tools(
                conn,
                execution_id=execution_id,
                tenant_id=tenant_id,
                trace_id=trace_id,
                started=started,
            )
        except Exception as exc:
            await _mark_failed(
                conn,
                execution_id=execution_id,
                tenant_id=tenant_id,
                error_code="RUNTIME_EXECUTION_FAILED",
                error_message=str(exc),
                trace_id=trace_id,
            )
            raise

        await _persist_success(
            conn,
            execution_id=execution_id,
            tenant_id=tenant_id,
            trace_id=trace_id,
            started=started,
            output=output,
            llm=llm,
            checkpoint_writes_buffer=checkpoint_writes_buffer,
        )
        return {"status": "succeeded", "output": output, "usage": llm.usage}
    finally:
        await conn.close()
