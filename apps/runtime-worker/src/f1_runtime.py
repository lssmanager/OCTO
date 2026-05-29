from __future__ import annotations

import json
import os
import uuid
from datetime import UTC, datetime
from typing import Any

import asyncpg
import structlog

from .fsm_contract import validate_transition
from .llm_provider import LLMCallResult, call_llm
from .reclaim_lineage import validate_checkpoint_lineage
from .tools.executor import execute_tool_call

log = structlog.get_logger(__name__)


async def _next_outbox_sequence(conn: asyncpg.Connection, tenant_id: str, execution_id: str) -> int:
    await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", f"{tenant_id}:execution:{execution_id}")
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
    meta = dict(payload.get("_meta", {})) if isinstance(payload.get("_meta"), dict) else {}
    occurred_at = meta.get("occurredAt") or datetime.now(UTC).isoformat().replace("+00:00", "Z")
    normalized_payload = {
        **payload,
        "_meta": {
            **meta,
            "traceId": str(meta.get("traceId") or payload.get("traceId") or "unknown-trace"),
            "spanId": str(meta.get("spanId") or "unknown-span"),
            "occurredAt": str(occurred_at),
            "schemaVersion": str(meta.get("schemaVersion") or "1.0"),
            "source": "runtime-worker",
            "service": "runtime-worker",
        },
    }
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
        _json(normalized_payload),
    )


def _messages_from_state(state_json: dict[str, Any] | None, fallback_input: dict[str, Any]) -> list[dict[str, Any]]:
    if isinstance(state_json, dict):
        messages = state_json.get("messages")
        if isinstance(messages, list) and messages:
            return messages
    return [{"role": "user", "content": str(fallback_input)}]


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
        last_checkpoint_id: str | None = None
        base_messages = [{"role": "user", "content": str(row["input_json"] or {})}]
        checkpoint_step_index = 0
        checkpoint_source = "input"

        if mode == "reclaim":
            cps = await conn.fetch(
                """
                SELECT id, step_index, parent_checkpoint_id, state_json, source
                FROM execution_checkpoints
                WHERE execution_id=$1 AND tenant_id=$2
                ORDER BY step_index ASC
                """,
                execution_id,
                tenant_id,
            )

            checkpoint_rows = [dict(cp) for cp in cps]
            if checkpoint_rows:
                if not validate_checkpoint_lineage(checkpoint_rows):
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

                latest = checkpoint_rows[-1]
                last_checkpoint_id = str(latest["id"])
                checkpoint_step_index = int(latest["step_index"]) + 1
                checkpoint_source = "reclaim"
                base_messages = _messages_from_state(
                    latest.get("state_json") if isinstance(latest.get("state_json"), dict) else {},
                    row["input_json"] or {},
                )

        if status != "dispatched":
            log.info(
                "execution.f1_runtime_skipped",
                execution_id=execution_id,
                tenant_id=tenant_id,
                status=status,
                legacy_state=row["state"],
                mode=mode,
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

        checkpoint_id = str(uuid.uuid4())
        input_json = row["input_json"] or {}
        context_snapshot = row["context_snapshot_json"] or {}
        await conn.execute(
            """
            INSERT INTO execution_checkpoints (
              id, tenant_id, execution_id, step_index, source, parent_checkpoint_id,
              state_json, metadata_json, channel_versions, versions_seen, worker_id, schema_version
            ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,'{}'::jsonb,'{}'::jsonb,$9,1)
            """,
            checkpoint_id,
            tenant_id,
            execution_id,
            checkpoint_step_index,
            checkpoint_source,
            last_checkpoint_id,
            _json({"messages": base_messages}),
            _json({"checkpoint_schema_version": 1}),
            worker_id,
        )

        llm_step_index = checkpoint_step_index + 1
        llm_step_id = str(uuid.uuid4())
        await conn.execute(
            """
            INSERT INTO execution_steps (
              id, tenant_id, execution_id, step_index, step_type, status,
              state_from, state_to, input_json, output_json, started_at
            ) VALUES ($1,$2,$3,$4,'llm_call','running','dispatched','running',$5::jsonb,$6::jsonb,now())
            """,
            llm_step_id,
            tenant_id,
            execution_id,
            llm_step_index,
            _json({"provider": "fake" if fake else "litellm", "mode": mode}),
            _json({}),
        )

        await _insert_outbox(
            conn,
            tenant_id=tenant_id,
            execution_id=execution_id,
            event_type="ExecutionStarted",
            payload={"executionId": execution_id, "traceId": trace_id, "mode": mode},
        )

        return {
            "input_json": input_json,
            "context_snapshot_json": context_snapshot,
            "agent_id": row["agent_id"],
            "checkpoint_id": checkpoint_id,
            "checkpoint_step_index": checkpoint_step_index,
            "llm_step_id": llm_step_id,
            "llm_step_index": llm_step_index,
            "messages": base_messages,
            "mode": mode,
        }


async def _run_llm_and_tools(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    trace_id: str | None,
    started: dict[str, Any],
) -> tuple[str, LLMCallResult]:
    messages = list(started.get("messages") or [{"role": "user", "content": str(started["input_json"])}])
    snapshot = started["context_snapshot_json"] or {}
    agent_id = str(started["agent_id"])

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
                step_index=started["llm_step_index"] + idx + 1,
                tool_call=tc,
                trace_id=trace_id,
            )
            await conn.execute(
                """
                INSERT INTO execution_checkpoint_writes (
                  id, tenant_id, checkpoint_id, task_id, task_path, write_index, channel, type, value_json
                ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
                """,
                str(uuid.uuid4()),
                tenant_id,
                started["checkpoint_id"],
                execution_id,
                "tool",
                idx,
                "messages",
                "tool_result",
                _json(tool_res),
            )
            messages.append({"role": "tool", "content": _json(tool_res), "tool_call_id": tc.get("id")})
        llm2 = await call_llm(
            tenant_id=tenant_id,
            execution_id=execution_id,
            agent_id=agent_id,
            messages=messages,
            snapshot=snapshot,
        )
        return llm2.content, llm2
    return llm.content, llm


async def _persist_success(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    trace_id: str | None,
    started: dict[str, Any],
    output: str,
    llm: LLMCallResult,
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
            ) VALUES ($1,$2,$3,$4,'loop',$5,$6::jsonb,$7::jsonb,'{}'::jsonb,'{}'::jsonb,$8,1)
            """,
            cp1,
            tenant_id,
            execution_id,
            started["checkpoint_step_index"] + 2,
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
            output, llm = await _run_llm_and_tools(
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
        )
        return {"status": "succeeded", "output": output, "usage": llm.usage}
    finally:
        await conn.close()
