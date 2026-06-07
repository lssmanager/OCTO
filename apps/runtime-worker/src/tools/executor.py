from __future__ import annotations

import asyncio
import hashlib
import json
import time
import uuid
from collections.abc import Mapping
from typing import Any

from jsonschema import ValidationError, validate

from .errors import ToolError
from .policy import ToolPolicyDecision, authorize_tool
from .registry import ToolRegistry

registry = ToolRegistry()


class ToolApprovalRequired(ToolError):
    def __init__(self, approval_id: str, invocation_id: str):
        super().__init__("TOOL_APPROVAL_REQUIRED", "tool call requires human approval", False)
        self.approval_id = approval_id
        self.invocation_id = invocation_id


async def execute_tool_call(
    conn,
    *,
    tenant_id: str,
    execution_id: str,
    step_id: str,
    step_index: int,
    tool_call: dict[str, Any],
    trace_id: str | None,
    agent_id: str | None = None,
    context_snapshot: Mapping[str, Any] | None = None,
) -> dict[str, Any]:
    name = str(tool_call.get("name", ""))
    args, input_error = _parse_args(tool_call.get("arguments_json") or "{}")
    invocation_call_id = str(tool_call.get("id") or "noid")
    args_hash = _hash_json(args)
    idem = _build_idempotency_key(
        execution_id=execution_id,
        tool_name=name,
        tool_call_id=invocation_call_id,
        arguments_hash=args_hash,
    )

    duplicate = await _find_existing_invocation(conn, tenant_id, idem)
    if duplicate is not None:
        return _result_from_existing_invocation(duplicate, name)

    defn, fn = registry.resolve(name)
    effective_tools = registry.resolve_effective(context_snapshot)
    decision = authorize_tool(
        defn,
        tenant_id,
        agent_id=agent_id,
        tool_name=name,
        effective_tool_names=effective_tools,
        snapshot=context_snapshot,
    )
    inv_id = str(uuid.uuid4())

    if input_error is not None:
        await _insert_invocation(
            conn,
            inv_id=inv_id,
            tenant_id=tenant_id,
            execution_id=execution_id,
            step_id=step_id,
            name=name,
            status="FAILED",
            args=args,
            idempotency_key=idem,
            trace_id=trace_id,
            tool_kind=defn.kind if defn else "unknown",
            error_code="TOOL_INPUT_INVALID",
            error_message=input_error,
            input_schema_valid=False,
            policy=decision,
            arguments_hash=args_hash,
        )
        return _failure(name, "TOOL_INPUT_INVALID", input_error, retryable=False, tool_call_id=invocation_call_id)

    if decision.outcome == "deny":
        await _insert_invocation(
            conn,
            inv_id=inv_id,
            tenant_id=tenant_id,
            execution_id=execution_id,
            step_id=step_id,
            name=name,
            status="FAILED",
            args=args,
            idempotency_key=idem,
            trace_id=trace_id,
            tool_kind=defn.kind if defn else "unknown",
            error_code=decision.code or "TOOL_NOT_ALLOWED",
            error_message=decision.reason or decision.code or "TOOL_NOT_ALLOWED",
            policy=decision,
            arguments_hash=args_hash,
        )
        return _failure(
            name,
            decision.code or "TOOL_NOT_ALLOWED",
            decision.reason or "TOOL_NOT_ALLOWED",
            retryable=False,
            tool_call_id=invocation_call_id,
        )

    if decision.outcome == "approval_required":
        approval_id = str(uuid.uuid4())
        await _insert_approval_required(
            conn,
            inv_id=inv_id,
            approval_id=approval_id,
            tenant_id=tenant_id,
            execution_id=execution_id,
            step_id=step_id,
            name=name,
            args=args,
            idempotency_key=idem,
            trace_id=trace_id,
            tool_kind=defn.kind if defn else "unknown",
            policy=decision,
            arguments_hash=args_hash,
        )
        raise ToolApprovalRequired(approval_id, inv_id)

    await _insert_invocation(
        conn,
        inv_id=inv_id,
        tenant_id=tenant_id,
        execution_id=execution_id,
        step_id=step_id,
        name=name,
        status="RUNNING",
        args=args,
        idempotency_key=idem,
        trace_id=trace_id,
        tool_kind=defn.kind if defn else "unknown",
        policy=decision,
        arguments_hash=args_hash,
    )
    try:
        validate(instance=args, schema=defn.input_schema)  # type: ignore[union-attr]
    except ValidationError as e:
        await conn.execute(
            """
            UPDATE tool_invocations
            SET status='FAILED', error_code='TOOL_INPUT_INVALID', error_message=$2,
                error=$3::jsonb, input_schema_valid=false, ended_at=now(), completed_at=now()
            WHERE id=$1
            """,
            inv_id,
            str(e),
            json.dumps({"code": "TOOL_INPUT_INVALID", "message": str(e)}),
        )
        return _failure(name, "TOOL_INPUT_INVALID", str(e), retryable=False, tool_call_id=invocation_call_id)

    start = time.perf_counter()
    try:
        if fn is None:
            raise ToolError("TOOL_HANDLER_MISSING", "tool handler is not registered", False)
        result = await asyncio.wait_for(
            asyncio.to_thread(fn, args),
            timeout=defn.timeout_ms / 1000,  # type: ignore[union-attr]
        )
    except asyncio.TimeoutError:
        await conn.execute(
            """
            UPDATE tool_invocations
            SET status='TIMED_OUT', error_code='TOOL_TIMEOUT', error_message='tool timeout',
                error=$2::jsonb, ended_at=now(), completed_at=now()
            WHERE id=$1
            """,
            inv_id,
            json.dumps({"code": "TOOL_TIMEOUT", "message": "tool timeout"}),
        )
        return _failure(name, "TOOL_TIMEOUT", "tool timeout", retryable=True, tool_call_id=invocation_call_id)
    except ToolError as exc:
        await conn.execute(
            """
            UPDATE tool_invocations
            SET status='FAILED', error_code=$2, error_message=$3,
                error=$4::jsonb, ended_at=now(), completed_at=now()
            WHERE id=$1
            """,
            inv_id,
            exc.code,
            str(exc),
            json.dumps({"code": exc.code, "message": str(exc), "retryable": exc.retryable}),
        )
        return _failure(name, exc.code, str(exc), retryable=exc.retryable, tool_call_id=invocation_call_id)

    try:
        validate(instance=result, schema=defn.output_schema)  # type: ignore[union-attr]
    except ValidationError as e:
        await conn.execute(
            """
            UPDATE tool_invocations
            SET status='FAILED', error_code='TOOL_OUTPUT_INVALID', error_message=$2,
                output=$3::jsonb, result_json=$3::jsonb, output_schema_valid=false,
                error=$4::jsonb, ended_at=now(), completed_at=now()
            WHERE id=$1
            """,
            inv_id,
            str(e),
            json.dumps(result),
            json.dumps({"code": "TOOL_OUTPUT_INVALID", "message": str(e)}),
        )
        return _failure(name, "TOOL_OUTPUT_INVALID", str(e), retryable=False, tool_call_id=invocation_call_id)

    duration = int((time.perf_counter() - start) * 1000)
    await conn.execute(
        """
        UPDATE tool_invocations
        SET status='SUCCEEDED', output=$2::jsonb, result_json=$2::jsonb,
            input_schema_valid=true, output_schema_valid=true, duration_ms=$3,
            ended_at=now(), completed_at=now()
        WHERE id=$1
        """,
        inv_id,
        json.dumps(result),
        duration,
    )
    return {
        "type": "tool_result",
        "tool_name": name,
        "tool_call_id": invocation_call_id,
        "status": "succeeded",
        "result": result,
    }


def _build_idempotency_key(*, execution_id: str, tool_name: str, tool_call_id: str, arguments_hash: str) -> str:
    return f"{execution_id}:{tool_name}:{tool_call_id}:{arguments_hash}"


def _parse_args(args_raw: Any) -> tuple[dict[str, Any], str | None]:
    try:
        args = json.loads(args_raw) if isinstance(args_raw, str) else args_raw
    except Exception as exc:
        return {}, f"arguments_json is invalid: {exc}"
    if not isinstance(args, dict):
        return {}, "arguments_json must decode to an object"
    return args, None


def _hash_json(value: dict[str, Any]) -> str:
    return hashlib.sha256(
        json.dumps(value, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()


async def _find_existing_invocation(conn, tenant_id: str, idempotency_key: str) -> Mapping[str, Any] | None:
    row = await conn.fetchrow(
        """
        SELECT id, tool_name, status, result_json, error_code, error_message, approval_id
        FROM tool_invocations
        WHERE tenant_id=$1 AND idempotency_key=$2
        """,
        tenant_id,
        idempotency_key,
    )
    return row


def _result_from_existing_invocation(row: Mapping[str, Any], fallback_name: str) -> dict[str, Any]:
    status = str(row.get("status") or "")
    name = str(row.get("tool_name") or fallback_name)
    if status == "SUCCEEDED":
        return {
            "type": "tool_result",
            "tool_name": name,
            "status": "succeeded",
            "result": row.get("result_json"),
        }
    if status == "TIMED_OUT":
        return _failure(
            name,
            "TOOL_TIMEOUT",
            str(row.get("error_message") or "tool timeout"),
            retryable=True,
            duplicate=True,
        )
    if status == "APPROVAL_REQUIRED":
        return {
            "type": "tool_result",
            "tool_name": name,
            "status": "approval_required",
            "error_code": "TOOL_APPROVAL_REQUIRED",
            "approval_id": row.get("approval_id"),
            "retryable": False,
            "duplicate": True,
        }
    return _failure(
        name,
        str(row.get("error_code") or "TOOL_INVOCATION_DUPLICATE"),
        str(row.get("error_message") or "duplicate tool invocation"),
        retryable=False,
        duplicate=True,
    )


def _failure(
    name: str,
    code: str,
    message: str,
    *,
    retryable: bool,
    duplicate: bool = False,
    tool_call_id: str | None = None,
) -> dict[str, Any]:
    result: dict[str, Any] = {
        "type": "tool_result",
        "tool_name": name,
        "status": "failed",
        "error_code": code,
        "message": message,
        "retryable": retryable,
    }
    if duplicate:
        result["duplicate"] = True
    if tool_call_id is not None:
        result["tool_call_id"] = tool_call_id
    return result


async def _insert_invocation(
    conn,
    *,
    inv_id: str,
    tenant_id: str,
    execution_id: str,
    step_id: str,
    name: str,
    status: str,
    args: dict[str, Any],
    idempotency_key: str,
    trace_id: str | None,
    tool_kind: str,
    policy: ToolPolicyDecision,
    arguments_hash: str,
    error_code: str | None = None,
    error_message: str | None = None,
    input_schema_valid: bool | None = None,
) -> None:
    await conn.execute(
        """
        INSERT INTO tool_invocations (
          id, tenant_id, execution_id, step_id, tool_name, tool_kind, status,
          args_json, input, error_code, error_message, error, requires_approval,
          idempotency_key, trace_id, policy_snapshot_json, arguments_hash,
          input_schema_valid, started_at, invoked_at
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12,$13,$14,$15::jsonb,$16,$17,now(),now())
        """,
        inv_id,
        tenant_id,
        execution_id,
        step_id,
        name,
        tool_kind,
        status,
        json.dumps(args),
        error_code,
        error_message,
        json.dumps({"code": error_code, "message": error_message} if error_code else None),
        policy.requires_approval,
        idempotency_key,
        trace_id,
        json.dumps(policy.snapshot or {}),
        arguments_hash,
        input_schema_valid,
    )


async def _insert_approval_required(
    conn,
    *,
    inv_id: str,
    approval_id: str,
    tenant_id: str,
    execution_id: str,
    step_id: str,
    name: str,
    args: dict[str, Any],
    idempotency_key: str,
    trace_id: str | None,
    tool_kind: str,
    policy: ToolPolicyDecision,
    arguments_hash: str,
) -> None:
    async with conn.transaction():
        await _insert_invocation(
            conn,
            inv_id=inv_id,
            tenant_id=tenant_id,
            execution_id=execution_id,
            step_id=step_id,
            name=name,
            status="APPROVAL_REQUIRED",
            args=args,
            idempotency_key=idempotency_key,
            trace_id=trace_id,
            tool_kind=tool_kind,
            error_code="TOOL_APPROVAL_REQUIRED",
            error_message=policy.reason,
            policy=policy,
            arguments_hash=arguments_hash,
        )
        await conn.execute(
            """
            INSERT INTO approvals (
              id, tenant_id, execution_id, step_id, kind, status, title, reason, payload_json
            ) VALUES ($1,$2,$3,$4,'tool_invocation','PENDING',$5,$6,$7::jsonb)
            """,
            approval_id,
            tenant_id,
            execution_id,
            step_id,
            f"Approve tool {name}",
            policy.reason,
            json.dumps(
                {
                    "tool_name": name,
                    "arguments": args,
                    "tool_invocation_id": inv_id,
                    "trace_id": trace_id,
                }
            ),
        )
        await conn.execute(
            "UPDATE tool_invocations SET approval_id=$2, ended_at=now(), completed_at=now() WHERE id=$1",
            inv_id,
            approval_id,
        )
        await conn.execute(
            """
            UPDATE executions
            SET status='waiting_human', state='waiting_human', updated_at=now(), version=version+1
            WHERE id=$1 AND tenant_id=$2 AND status='running'
            """,
            execution_id,
            tenant_id,
        )
