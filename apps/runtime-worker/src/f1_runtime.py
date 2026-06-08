from __future__ import annotations

import hashlib
import json
import os
import uuid
from datetime import UTC, datetime
from typing import Any

import asyncpg
import structlog

from .fsm_contract import validate_transition
from .llm_provider import GovernedLLMError, LLMCallResult, call_llm
from .reclaim_lineage import validate_checkpoint_lineage
from .tools.executor import ToolApprovalRequired, execute_tool_call

log = structlog.get_logger(__name__)

# F1 runtime direct-writer contract. This is accepted F1 debt: the runtime
# persists durable execution progress directly in PostgreSQL so reclaim/replay
# can recover after worker restarts. Keep this list synchronized with
# docs/architecture/F1-architecture-status.md and scripts/check-f1-runtime-boundary.sh.
F1_RUNTIME_DB_WRITE_TABLES = frozenset(
    {
        "executions",
        "execution_steps",
        "execution_checkpoints",
        "execution_checkpoint_writes",
        "tool_invocations",
        "approvals",
        "outbox_events",
        "worker_heartbeats",
    }
)


def runtime_database_url() -> str:
    """Return the F1 runtime-worker PostgreSQL DSN.

    RUNTIME_DATABASE_URL is the production/close-gate credential for the
    least-privilege runtime role. DATABASE_URL remains a development fallback
    for legacy tests and non-strict local runs only.
    """
    runtime_dsn = os.environ.get("RUNTIME_DATABASE_URL")
    if runtime_dsn:
        return runtime_dsn
    if os.environ.get("F1_CLOSE_GATE") == "1" or os.environ.get("NODE_ENV") == "production":
        raise RuntimeError("RUNTIME_DATABASE_URL required for F1 close/production runtime-worker")
    dsn = os.environ.get("DATABASE_URL")
    if not dsn:
        raise RuntimeError("RUNTIME_DATABASE_URL required")
    return dsn


async def _set_current_tenant(conn: asyncpg.Connection, tenant_id: str) -> None:
    await conn.execute("SELECT set_config('app.current_tenant', $1, false)", tenant_id)


async def _next_outbox_sequence(conn: asyncpg.Connection, tenant_id: str, execution_id: str) -> int:
    await conn.execute(
        "SELECT pg_advisory_xact_lock(hashtext($1))", f"{tenant_id}:execution:{execution_id}"
    )
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
    correlation_id: str | None = None,
    run_id: str | None = None,
    queue_job_id: str | None = None,
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
            "correlationId": str(
                meta.get("correlationId")
                or payload.get("correlationId")
                or correlation_id
                or payload.get("traceId")
                or "unknown-correlation"
            ),
            "runId": str(meta.get("runId") or payload.get("runId") or run_id or execution_id),
            "queueJobId": str(
                meta.get("queueJobId") or payload.get("queueJobId") or queue_job_id or execution_id
            ),
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


def _hash_tool_args(arguments_json: Any) -> str:
    try:
        parsed = json.loads(arguments_json) if isinstance(arguments_json, str) else arguments_json
    except Exception:
        parsed = arguments_json
    return hashlib.sha256(
        json.dumps(parsed, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _messages_hash(messages: list[dict[str, Any]]) -> str:
    return hashlib.sha256(
        json.dumps(messages, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


def _attach_stable_tool_call_keys(
    *, execution_id: str, messages: list[dict[str, Any]], tool_calls: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    prefix = _messages_hash(messages)
    seen: dict[tuple[str, str], int] = {}
    stable_calls: list[dict[str, Any]] = []
    for tool_call in tool_calls:
        call = dict(tool_call)
        name = str(call.get("name") or "")
        args_hash = _hash_tool_args(call.get("arguments_json") or {})
        key = (name, args_hash)
        ordinal = seen.get(key, 0)
        seen[key] = ordinal + 1
        call.setdefault(
            "semantic_tool_call_key",
            f"{execution_id}:tool:{prefix}:{name}:{args_hash}:{ordinal}",
        )
        stable_calls.append(call)
    return stable_calls


def _messages_from_state(
    state_json: dict[str, Any] | None, fallback_input: dict[str, Any]
) -> list[dict[str, Any]]:
    if isinstance(state_json, dict):
        messages = state_json.get("messages")
        if (
            isinstance(messages, list)
            and messages
            and all(isinstance(message, dict) for message in messages)
        ):
            return [dict(message) for message in messages]
    return [{"role": "user", "content": str(fallback_input)}]


def _contains_user_message(messages: list[dict[str, Any]]) -> bool:
    return any(isinstance(message, dict) and message.get("role") == "user" for message in messages)


def _should_replace_message_history(
    candidate: list[dict[str, Any]], current: list[dict[str, Any]]
) -> bool:
    if len(candidate) > len(current):
        return True
    if len(candidate) == len(current) and _contains_user_message(candidate):
        return candidate != current and (
            not _contains_user_message(current) or candidate[0] != current[0]
        )
    return False


def _message_from_checkpoint_write(write: dict[str, Any]) -> dict[str, Any] | None:
    if write.get("channel") != "messages":
        return None
    value = write.get("value_json")
    if not isinstance(value, dict):
        return None
    write_type = str(write.get("type") or "")
    if write_type == "assistant_message":
        message: dict[str, Any] = {
            "role": str(value.get("role") or "assistant"),
            "content": value.get("content") or "",
        }
        if isinstance(value.get("tool_calls"), list):
            message["tool_calls"] = value["tool_calls"]
        if value.get("tool_call_id") is not None:
            message["tool_call_id"] = value.get("tool_call_id")
        return message
    if write_type == "tool_result":
        message = {"role": "tool", "content": _json(value)}
        if value.get("tool_call_id") is not None:
            message["tool_call_id"] = value.get("tool_call_id")
        return message
    return None


def _apply_checkpoint_writes_to_messages(
    base_messages: list[dict[str, Any]], writes: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    messages = [dict(message) for message in base_messages]
    for write in sorted(writes, key=lambda row: int(row.get("write_index") or 0)):
        message = _message_from_checkpoint_write(write)
        if message is not None:
            messages.append(message)
    return messages


def _reconstruct_messages_from_checkpoint_lineage(
    checkpoint_rows: list[dict[str, Any]],
    writes_by_checkpoint: dict[str, list[dict[str, Any]]],
    fallback_input: dict[str, Any],
) -> list[dict[str, Any]]:
    messages = [{"role": "user", "content": str(fallback_input)}]
    for checkpoint in sorted(checkpoint_rows, key=lambda row: int(row.get("step_index") or 0)):
        state_messages = _messages_from_state(
            checkpoint.get("state_json") if isinstance(checkpoint.get("state_json"), dict) else {},
            fallback_input,
        )
        if _should_replace_message_history(state_messages, messages):
            messages = state_messages
        messages = _apply_checkpoint_writes_to_messages(
            messages,
            writes_by_checkpoint.get(str(checkpoint["id"]), []),
        )
    return messages


def _ownership_matches(row: asyncpg.Record, lease_token: str | None, attempt: int | None) -> bool:
    if not lease_token or attempt is None:
        return False
    return str(row["lease_token"] or "") == lease_token and int(row["attempt"] or 0) == attempt


async def _has_current_ownership(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    lease_token: str,
    attempt: int,
    lease_owner: str | None = None,
) -> bool:
    row = await conn.fetchrow(
        """
        SELECT status, lease_token, attempt, lease_owner
        FROM executions
        WHERE id=$1 AND tenant_id=$2
        """,
        execution_id,
        tenant_id,
    )
    return bool(
        row and str(row["status"]) == "running" and _ownership_matches(row, lease_token, attempt)
    )


class LostOwnershipError(RuntimeError):
    def __init__(self, execution_id: str, tenant_id: str, reason: str = "STALE_OWNERSHIP") -> None:
        super().__init__(reason)
        self.execution_id = execution_id
        self.tenant_id = tenant_id
        self.reason = reason


async def _mark_failed(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    error_code: str,
    error_message: str,
    trace_id: str | None,
    correlation_id: str | None = None,
    run_id: str | None = None,
    queue_job_id: str | None = None,
    retryable: bool = True,
    lease_token: str | None = None,
    attempt: int | None = None,
    lease_owner: str | None = None,
) -> None:
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT status, lease_token, attempt, lease_owner
            FROM executions
            WHERE id=$1 AND tenant_id=$2
            FOR UPDATE
            """,
            execution_id,
            tenant_id,
        )
        if row is None:
            return
        current_status = str(row["status"])
        if current_status not in {"completed", "failed", "cancelled"}:
            if not _ownership_matches(row, lease_token, attempt):
                log.warning(
                    "execution.stale_owner_failed_write_rejected",
                    execution_id=execution_id,
                    tenant_id=tenant_id,
                    expected_lease_token=lease_token,
                    expected_attempt=attempt,
                    current_lease_token=row["lease_token"],
                    current_attempt=row["attempt"],
                )
                raise LostOwnershipError(execution_id, tenant_id)
            validate_transition(current_status, "failed")
            updated = await conn.fetchrow(
                """
                UPDATE executions
                SET status='failed', state='failed', version=version+1,
                    error_code=$3, error_message=$4,
                    error=$5::jsonb, updated_at=now(), completed_at=now()
                WHERE id=$1 AND tenant_id=$2 AND status=$6 AND lease_token=$7 AND attempt=$8
                  AND ($9::text IS NULL OR lease_owner=$9)
                RETURNING version
                """,
                execution_id,
                tenant_id,
                error_code,
                error_message,
                _json({"code": error_code, "message": error_message, "retryable": retryable}),
                current_status,
                lease_token,
                attempt,
                lease_owner,
            )
            if updated is None:
                raise LostOwnershipError(execution_id, tenant_id)
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
                    "retryable": retryable,
                    "correlationId": correlation_id,
                    "runId": run_id,
                    "queueJobId": queue_job_id,
                },
                correlation_id=correlation_id,
                run_id=run_id,
                queue_job_id=queue_job_id,
            )


async def _claim_and_start(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    trace_id: str | None,
    correlation_id: str | None,
    run_id: str | None,
    queue_job_id: str | None,
    mode: str,
    lease_token: str,
    attempt: int,
    lease_owner: str | None = None,
) -> dict[str, Any] | None:
    worker_id = os.environ.get("HOSTNAME", "runtime-worker")
    fake = os.environ.get("OCTO_TEST_LLM_FAKE", "false").lower() == "true"

    async with conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT id, status, state, version, input_json, context_snapshot_json, agent_id, lease_token, attempt, lease_owner
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
                        if not _ownership_matches(row, lease_token, attempt):
                            return {"status": "lost_ownership", "reason": "STALE_OWNERSHIP"}
                        validate_transition(status, "failed")
                        await conn.execute(
                            """
                            UPDATE executions
                            SET status='failed', state='failed', version=version+1,
                                error_code='CHECKPOINT_LINEAGE_BROKEN',
                                error_message='checkpoint lineage invalid',
                                updated_at=now(), completed_at=now()
                            WHERE id=$1 AND tenant_id=$2 AND status=$3 AND lease_token=$4 AND attempt=$5
                              AND version=$6 AND ($7::text IS NULL OR lease_owner=$7)
                            """,
                            execution_id,
                            tenant_id,
                            status,
                            lease_token,
                            attempt,
                            row["version"],
                            lease_owner,
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
                                "correlationId": correlation_id,
                                "runId": run_id,
                                "queueJobId": queue_job_id,
                            },
                            correlation_id=correlation_id,
                            run_id=run_id,
                            queue_job_id=queue_job_id,
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

        if not _ownership_matches(row, lease_token, attempt):
            log.warning(
                "execution.stale_owner_start_rejected",
                execution_id=execution_id,
                tenant_id=tenant_id,
                expected_lease_token=lease_token,
                expected_attempt=attempt,
                current_lease_token=row["lease_token"],
                current_attempt=row["attempt"],
                current_status=status,
            )
            return {"status": "lost_ownership", "reason": "STALE_OWNERSHIP"}

        if lease_owner and str(row["lease_owner"] or "") != lease_owner:
            log.warning(
                "execution.stale_owner_lease_owner_rejected",
                execution_id=execution_id,
                tenant_id=tenant_id,
                expected_lease_owner=lease_owner,
                current_lease_owner=row["lease_owner"],
            )
            return {"status": "lost_ownership", "reason": "STALE_OWNERSHIP"}

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
            WHERE id=$1 AND tenant_id=$2 AND status='dispatched' AND version=$3 AND lease_token=$5 AND attempt=$6
              AND ($7::text IS NULL OR lease_owner=$7)
            RETURNING version
            """,
            execution_id,
            tenant_id,
            row["version"],
            worker_id,
            lease_token,
            attempt,
            lease_owner,
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
            payload={
                "executionId": execution_id,
                "traceId": trace_id,
                "correlationId": correlation_id,
                "runId": run_id,
                "queueJobId": queue_job_id,
                "mode": mode,
            },
            correlation_id=correlation_id,
            run_id=run_id,
            queue_job_id=queue_job_id,
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
            "trace_id": trace_id,
            "correlation_id": correlation_id,
            "run_id": run_id or execution_id,
            "queue_job_id": queue_job_id or execution_id,
            "lease_token": lease_token,
            "attempt": attempt,
            "lease_owner": lease_owner,
        }


async def _run_llm_and_tools(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    trace_id: str | None,
    started: dict[str, Any],
) -> tuple[str, LLMCallResult, list[dict[str, Any]]]:
    messages = list(
        started.get("messages") or [{"role": "user", "content": str(started["input_json"])}]
    )
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
        stable_tool_calls = _attach_stable_tool_call_keys(
            execution_id=execution_id, messages=messages, tool_calls=llm.tool_calls
        )
        assistant_message = {"role": "assistant", "content": "", "tool_calls": stable_tool_calls}
        messages.append(assistant_message)
        if not await _has_current_ownership(
            conn,
            execution_id=execution_id,
            tenant_id=tenant_id,
            lease_token=str(started["lease_token"]),
            attempt=int(started["attempt"]),
            lease_owner=started.get("lease_owner"),
        ):
            log.warning(
                "execution.stale_owner_checkpoint_write_rejected",
                execution_id=execution_id,
                tenant_id=tenant_id,
                lease_token=started["lease_token"],
                attempt=started["attempt"],
            )
            raise LostOwnershipError(execution_id, tenant_id)

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
            0,
            "messages",
            "assistant_message",
            _json(assistant_message),
        )
        for idx, tc in enumerate(stable_tool_calls):
            tool_res = await execute_tool_call(
                conn,
                tenant_id=tenant_id,
                execution_id=execution_id,
                step_id=started["llm_step_id"],
                step_index=started["llm_step_index"] + idx + 1,
                tool_call=tc,
                trace_id=trace_id,
                agent_id=agent_id,
                context_snapshot=snapshot,
            )
            if tool_res.get("status") == "approval_required":
                raise ToolApprovalRequired(
                    str(tool_res.get("approval_id") or ""),
                    str(tool_res.get("tool_invocation_id") or ""),
                )
            if not await _has_current_ownership(
                conn,
                execution_id=execution_id,
                tenant_id=tenant_id,
                lease_token=str(started["lease_token"]),
                attempt=int(started["attempt"]),
                lease_owner=started.get("lease_owner"),
            ):
                log.warning(
                    "execution.stale_owner_checkpoint_write_rejected",
                    execution_id=execution_id,
                    tenant_id=tenant_id,
                    lease_token=started["lease_token"],
                    attempt=started["attempt"],
                )
                raise LostOwnershipError(execution_id, tenant_id)

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
                idx + 1,
                "messages",
                "tool_result",
                _json(tool_res),
            )
            messages.append(
                {"role": "tool", "content": _json(tool_res), "tool_call_id": tc.get("id")}
            )
        llm2 = await call_llm(
            tenant_id=tenant_id,
            execution_id=execution_id,
            agent_id=agent_id,
            messages=messages,
            snapshot=snapshot,
        )
        final_messages = [*messages, {"role": "assistant", "content": llm2.content}]
        return llm2.content, llm2, final_messages
    final_messages = [*messages, {"role": "assistant", "content": llm.content}]
    return llm.content, llm, final_messages


async def _persist_success(
    conn: asyncpg.Connection,
    *,
    execution_id: str,
    tenant_id: str,
    trace_id: str | None,
    started: dict[str, Any],
    output: str,
    llm: LLMCallResult,
    final_messages: list[dict[str, Any]],
) -> None:
    worker_id = os.environ.get("HOSTNAME", "runtime-worker")
    async with conn.transaction():
        row = await conn.fetchrow(
            """
            SELECT status, lease_token, attempt, lease_owner
            FROM executions
            WHERE id=$1 AND tenant_id=$2
            FOR UPDATE
            """,
            execution_id,
            tenant_id,
        )
        if row is None:
            raise RuntimeError("execution_not_found")
        current_status = str(row["status"])
        if not _ownership_matches(row, str(started["lease_token"]), int(started["attempt"])):
            log.warning(
                "execution.stale_owner_terminal_write_rejected",
                execution_id=execution_id,
                tenant_id=tenant_id,
                expected_lease_token=started["lease_token"],
                expected_attempt=started["attempt"],
                current_lease_token=row["lease_token"],
                current_attempt=row["attempt"],
            )
            raise LostOwnershipError(execution_id, tenant_id)
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
                        "attempted_models": llm.attempted_models,
                        "accounting_error": llm.accounting_error,
                        "accounting_error_reason": llm.accounting_error_reason,
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
            _json({"messages": final_messages}),
            _json({"checkpoint_schema_version": 1}),
            worker_id,
        )
        updated = await conn.fetchrow(
            """
            UPDATE executions
            SET status='completed', state='completed', version=version+1,
                result=$4::jsonb, output_json=$4::jsonb, completed_at=now(),
                updated_at=now(), last_checkpoint_id=$3,
                token_usage=$5::jsonb
            WHERE id=$1 AND tenant_id=$2 AND status='running' AND lease_token=$6 AND attempt=$7
              AND ($8::text IS NULL OR lease_owner=$8)
            RETURNING version
            """,
            execution_id,
            tenant_id,
            cp1,
            _json({"output": output}),
            _json(llm.usage),
            str(started["lease_token"]),
            int(started["attempt"]),
            started.get("lease_owner"),
        )
        if updated is None:
            raise LostOwnershipError(execution_id, tenant_id)
        await _insert_outbox(
            conn,
            tenant_id=tenant_id,
            execution_id=execution_id,
            event_type="ExecutionCheckpointed",
            payload={
                "executionId": execution_id,
                "checkpointId": cp1,
                "traceId": trace_id,
                "correlationId": started.get("correlation_id"),
                "runId": started.get("run_id"),
                "queueJobId": started.get("queue_job_id"),
            },
            correlation_id=str(started.get("correlation_id") or trace_id or ""),
            run_id=str(started.get("run_id") or execution_id),
            queue_job_id=str(started.get("queue_job_id") or execution_id),
        )
        if llm.accounting_error:
            await _insert_outbox(
                conn,
                tenant_id=tenant_id,
                execution_id=execution_id,
                event_type="ExecutionAccountingWarning",
                payload={
                    "executionId": execution_id,
                    "traceId": trace_id,
                    "errorCode": "LLM_ACCOUNTING_INCOMPLETE",
                    "errorMessage": llm.accounting_error_reason
                    or "LLM usage accounting was incomplete",
                    "model": llm.model,
                    "correlationId": started.get("correlation_id"),
                    "runId": started.get("run_id"),
                    "queueJobId": started.get("queue_job_id"),
                },
                correlation_id=str(started.get("correlation_id") or trace_id or ""),
                run_id=str(started.get("run_id") or execution_id),
                queue_job_id=str(started.get("queue_job_id") or execution_id),
            )
        await _insert_outbox(
            conn,
            tenant_id=tenant_id,
            execution_id=execution_id,
            event_type="ExecutionSucceeded",
            payload={
                "executionId": execution_id,
                "output": output,
                "traceId": trace_id,
                "correlationId": started.get("correlation_id"),
                "runId": started.get("run_id"),
                "queueJobId": started.get("queue_job_id"),
            },
            correlation_id=str(started.get("correlation_id") or trace_id or ""),
            run_id=str(started.get("run_id") or execution_id),
            queue_job_id=str(started.get("queue_job_id") or execution_id),
        )


async def run_f1_execution(
    execution_id: str,
    tenant_id: str,
    trace_id: str | None = None,
    correlation_id: str | None = None,
    run_id: str | None = None,
    queue_job_id: str | None = None,
    mode: str = "normal",
    lease_token: str | None = None,
    attempt: int | None = None,
    lease_owner: str | None = None,
) -> dict[str, Any]:
    dsn = runtime_database_url()
    if not lease_token or attempt is None:
        raise RuntimeError("lease_token and attempt are required for F1 runtime ownership")

    conn = await asyncpg.connect(dsn)
    try:
        await _set_current_tenant(conn, tenant_id)
        log.info(
            "execution.runtime_accepted",
            execution_id=execution_id,
            tenant_id=tenant_id,
            trace_id=trace_id,
            correlation_id=correlation_id or trace_id,
            run_id=run_id or execution_id,
            queue_job_id=queue_job_id or execution_id,
            mode=mode,
            attempt=attempt,
            lease_owner=lease_owner,
        )
        started = await _claim_and_start(
            conn,
            execution_id=execution_id,
            tenant_id=tenant_id,
            trace_id=trace_id,
            correlation_id=correlation_id or trace_id,
            run_id=run_id or execution_id,
            queue_job_id=queue_job_id or execution_id,
            mode=mode,
            lease_token=lease_token,
            attempt=attempt,
            lease_owner=lease_owner,
        )
        if started is None:
            return {"status": "skipped", "reason": "not_dispatched"}
        if started.get("status") in {"cas_conflict", "failed", "lost_ownership"}:
            return started

        try:
            output, llm, final_messages = await _run_llm_and_tools(
                conn,
                execution_id=execution_id,
                tenant_id=tenant_id,
                trace_id=trace_id,
                started=started,
            )
        except ToolApprovalRequired as exc:
            if not await _has_current_ownership(
                conn,
                execution_id=execution_id,
                tenant_id=tenant_id,
                lease_token=str(started["lease_token"]),
                attempt=int(started["attempt"]),
            ):
                return {"status": "lost_ownership", "reason": "STALE_OWNERSHIP"}
            await _insert_outbox(
                conn,
                tenant_id=tenant_id,
                execution_id=execution_id,
                event_type="ToolApprovalRequested",
                payload={
                    "executionId": execution_id,
                    "traceId": trace_id,
                    "approvalId": exc.approval_id,
                    "toolInvocationId": exc.invocation_id,
                    "correlationId": correlation_id or trace_id,
                    "runId": run_id or execution_id,
                    "queueJobId": queue_job_id or execution_id,
                },
                correlation_id=correlation_id or trace_id,
                run_id=run_id or execution_id,
                queue_job_id=queue_job_id or execution_id,
            )
            await _insert_outbox(
                conn,
                tenant_id=tenant_id,
                execution_id=execution_id,
                event_type="ExecutionPaused",
                payload={
                    "executionId": execution_id,
                    "traceId": trace_id,
                    "approvalId": exc.approval_id,
                    "reason": exc.code,
                    "correlationId": correlation_id or trace_id,
                    "runId": run_id or execution_id,
                    "queueJobId": queue_job_id or execution_id,
                },
                correlation_id=correlation_id or trace_id,
                run_id=run_id or execution_id,
                queue_job_id=queue_job_id or execution_id,
            )
            return {
                "status": "waiting_human",
                "approval_id": exc.approval_id,
                "tool_invocation_id": exc.invocation_id,
            }
        except LostOwnershipError as exc:
            return {"status": "lost_ownership", "reason": exc.reason}
        except GovernedLLMError as exc:
            try:
                await _mark_failed(
                    conn,
                    execution_id=execution_id,
                    tenant_id=tenant_id,
                    error_code=exc.code,
                    error_message=str(exc),
                    trace_id=trace_id,
                    correlation_id=correlation_id or trace_id,
                    run_id=run_id or execution_id,
                    queue_job_id=queue_job_id or execution_id,
                    retryable=exc.retryable,
                    lease_token=str(started["lease_token"]),
                    attempt=int(started["attempt"]),
                    lease_owner=started.get("lease_owner"),
                )
            except LostOwnershipError as ownership_exc:
                return {"status": "lost_ownership", "reason": ownership_exc.reason}
            raise
        except Exception as exc:
            try:
                await _mark_failed(
                    conn,
                    execution_id=execution_id,
                    tenant_id=tenant_id,
                    error_code="RUNTIME_EXECUTION_FAILED",
                    error_message=str(exc),
                    trace_id=trace_id,
                    correlation_id=correlation_id or trace_id,
                    run_id=run_id or execution_id,
                    queue_job_id=queue_job_id or execution_id,
                    retryable=True,
                    lease_token=str(started["lease_token"]),
                    attempt=int(started["attempt"]),
                    lease_owner=started.get("lease_owner"),
                )
            except LostOwnershipError as ownership_exc:
                return {"status": "lost_ownership", "reason": ownership_exc.reason}
            raise

        try:
            await _persist_success(
                conn,
                execution_id=execution_id,
                tenant_id=tenant_id,
                trace_id=trace_id,
                started=started,
                output=output,
                llm=llm,
                final_messages=final_messages,
            )
        except LostOwnershipError as exc:
            return {"status": "lost_ownership", "reason": exc.reason}
        return {"status": "succeeded", "output": output, "usage": llm.usage}
    finally:
        await conn.close()
