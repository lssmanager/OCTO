import json

import pytest

from src.tools.definitions import ToolDefinition
from src.tools.executor import ToolApprovalRequired, execute_tool_call, registry


class FakeConn:
    def __init__(self, duplicate=None):
        self.duplicate = duplicate
        self.calls = []

    async def fetchrow(self, query, *args):
        self.calls.append(("fetchrow", query, args))
        return self.duplicate

    async def execute(self, query, *args):
        self.calls.append(("execute", query, args))
        return "OK"

    def transaction(self):
        return self

    async def __aenter__(self):
        self.calls.append(("transaction_enter", "", ()))
        return self

    async def __aexit__(self, exc_type, exc, tb):
        self.calls.append(("transaction_exit", "", ()))
        return False


def _call(name="builtin.echo", args=None):
    return {"id": "call-1", "name": name, "arguments_json": json.dumps(args or {"text": "hi"})}


@pytest.mark.asyncio
async def test_allowed_tool_persists_success():
    conn = FakeConn()

    result = await execute_tool_call(
        conn,
        tenant_id="tenant-1",
        execution_id="exec-1",
        step_id="step-1",
        step_index=1,
        tool_call=_call(),
        trace_id="trace-1",
        agent_id="agent-1",
        context_snapshot={"effectiveToolNames": ["builtin.echo"]},
    )

    assert result["status"] == "succeeded"
    assert any("INSERT INTO tool_invocations" in call[1] and "RUNNING" in call[2] for call in conn.calls if call[0] == "execute")
    assert any("status='SUCCEEDED'" in call[1] for call in conn.calls if call[0] == "execute")


@pytest.mark.asyncio
async def test_denied_tool_records_failed_without_side_effect():
    conn = FakeConn()

    result = await execute_tool_call(
        conn,
        tenant_id="tenant-1",
        execution_id="exec-1",
        step_id="step-1",
        step_index=1,
        tool_call=_call(),
        trace_id="trace-1",
        agent_id="agent-1",
        context_snapshot={"effectiveToolNames": []},
    )

    assert result["error_code"] == "TOOL_NOT_ALLOWED"
    assert any("INSERT INTO tool_invocations" in call[1] and "TOOL_NOT_ALLOWED" in str(call[2]) for call in conn.calls if call[0] == "execute")
    assert not any("status='SUCCEEDED'" in call[1] for call in conn.calls if call[0] == "execute")


@pytest.mark.asyncio
async def test_invalid_input_is_persisted():
    conn = FakeConn()

    result = await execute_tool_call(
        conn,
        tenant_id="tenant-1",
        execution_id="exec-1",
        step_id="step-1",
        step_index=1,
        tool_call={"id": "call-1", "name": "builtin.echo", "arguments_json": "not-json"},
        trace_id="trace-1",
        context_snapshot={"effectiveToolNames": ["builtin.echo"]},
    )

    assert result["error_code"] == "TOOL_INPUT_INVALID"
    assert any("TOOL_INPUT_INVALID" in str(call[2]) for call in conn.calls if call[0] == "execute")


@pytest.mark.asyncio
async def test_invalid_output_is_persisted():
    registry.register(
        ToolDefinition(
            "test.invalid_output",
            "builtin_sync",
            "bad output",
            {"type": "object", "required": ["text"], "properties": {"text": {"type": "string"}}},
            {"type": "object", "required": ["ok"], "properties": {"ok": {"type": "boolean"}}},
        ),
        lambda args: {"unexpected": args["text"]},
    )
    conn = FakeConn()

    result = await execute_tool_call(
        conn,
        tenant_id="tenant-1",
        execution_id="exec-1",
        step_id="step-1",
        step_index=1,
        tool_call=_call("test.invalid_output"),
        trace_id="trace-1",
        context_snapshot={"effectiveToolNames": ["test.invalid_output"]},
    )

    assert result["error_code"] == "TOOL_OUTPUT_INVALID"
    assert any("TOOL_OUTPUT_INVALID" in call[1] for call in conn.calls if call[0] == "execute")


@pytest.mark.asyncio
async def test_timeout_is_retryable_and_persisted():
    import time

    registry.register(
        ToolDefinition("test.timeout", "builtin_sync", "slow", {"type": "object"}, {"type": "object"}, timeout_ms=1),
        lambda args: (time.sleep(0.05) or {}),
    )
    conn = FakeConn()

    result = await execute_tool_call(
        conn,
        tenant_id="tenant-1",
        execution_id="exec-1",
        step_id="step-1",
        step_index=1,
        tool_call=_call("test.timeout"),
        trace_id="trace-1",
        context_snapshot={"effectiveToolNames": ["test.timeout"]},
    )

    assert result["error_code"] == "TOOL_TIMEOUT"
    assert result["retryable"] is True
    assert any("TIMED_OUT" in call[1] for call in conn.calls if call[0] == "execute")


@pytest.mark.asyncio
async def test_duplicate_invocation_returns_previous_result_without_insert():
    conn = FakeConn(duplicate={"status": "SUCCEEDED", "tool_name": "builtin.echo", "result_json": {"text": "cached"}})

    result = await execute_tool_call(
        conn,
        tenant_id="tenant-1",
        execution_id="exec-1",
        step_id="step-1",
        step_index=1,
        tool_call=_call(),
        trace_id="trace-1",
        context_snapshot={"effectiveToolNames": ["builtin.echo"]},
    )

    assert result == {"type": "tool_result", "tool_name": "builtin.echo", "status": "succeeded", "result": {"text": "cached"}}
    assert not any("INSERT INTO tool_invocations" in call[1] for call in conn.calls if call[0] == "execute")


@pytest.mark.asyncio
async def test_approval_required_transitions_to_waiting_human():
    conn = FakeConn()

    with pytest.raises(ToolApprovalRequired) as exc_info:
        await execute_tool_call(
            conn,
            tenant_id="tenant-1",
            execution_id="exec-1",
            step_id="step-1",
            step_index=1,
            tool_call=_call(),
            trace_id="trace-1",
            context_snapshot={"effectiveToolNames": ["builtin.echo"], "tool_policy": {"require_approval": ["builtin.echo"]}},
        )

    assert exc_info.value.code == "TOOL_APPROVAL_REQUIRED"
    assert any("INSERT INTO approvals" in call[1] for call in conn.calls if call[0] == "execute")
    assert any("status='waiting_human'" in call[1] for call in conn.calls if call[0] == "execute")
