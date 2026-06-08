from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from typing import Any
import sys
import types

import pytest

sys.modules.setdefault("asyncpg", types.SimpleNamespace(Connection=object, connect=None))
sys.modules.setdefault(
    "structlog",
    types.SimpleNamespace(
        get_logger=lambda _name=None: types.SimpleNamespace(
            info=lambda *a, **k: None, warning=lambda *a, **k: None, exception=lambda *a, **k: None
        )
    ),
)
try:
    import jsonschema  # noqa: F401
except ModuleNotFoundError:
    sys.modules.setdefault(
        "jsonschema",
        types.SimpleNamespace(validate=lambda **_kwargs: None, ValidationError=ValueError),
    )

from src import f1_runtime
from src.fsm_contract import InvalidExecutionTransitionError, validate_transition
from src.llm_provider import LLMCallResult


def test_runtime_database_url_prefers_runtime_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://wide")
    monkeypatch.setenv("RUNTIME_DATABASE_URL", "postgres://runtime")

    assert f1_runtime.runtime_database_url() == "postgres://runtime"


def test_runtime_database_url_requires_runtime_url_in_close_mode(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgres://wide")
    monkeypatch.delenv("RUNTIME_DATABASE_URL", raising=False)
    monkeypatch.setenv("F1_CLOSE_GATE", "1")

    with pytest.raises(RuntimeError, match="RUNTIME_DATABASE_URL required"):
        f1_runtime.runtime_database_url()


class _Tx:
    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False


class FakeRow(dict):
    def __getitem__(self, key: str) -> Any:
        return dict.__getitem__(self, key)


@dataclass
class FakeConn:
    row_status: str = "dispatched"
    row_state: str = "queued"
    agent_id: str = "agent-real"
    checkpoints: list[dict[str, Any]] = field(default_factory=list)
    checkpoint_writes: list[dict[str, Any]] = field(default_factory=list)
    lease_token: str = "lease-1"
    attempt: int = 1
    lease_owner: str = "scheduler-test"
    closed: bool = False

    def __post_init__(self) -> None:
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self.status = self.row_status

    def transaction(self) -> _Tx:
        return _Tx()

    async def fetchrow(self, query: str, *args: Any) -> FakeRow | None:
        if "SELECT id, status, state" in query:
            return FakeRow(
                id="exec-1",
                status=self.status,
                state=self.row_state,
                version=7,
                input_json={"prompt": "hello"},
                context_snapshot_json={},
                agent_id=self.agent_id,
                lease_token=self.lease_token,
                attempt=self.attempt,
                lease_owner=self.lease_owner,
            )
        if "UPDATE executions" in query and "RETURNING version" in query:
            if "SET status='running'" in query:
                self.status = "running"
            if "SET status='completed'" in query:
                self.status = "completed"
            if "SET status='failed'" in query:
                self.status = "failed"
            self.executed.append((query, args))
            return FakeRow(version=8)
        if "SELECT status, lease_token, attempt" in query:
            return FakeRow(status=self.status, lease_token=self.lease_token, attempt=self.attempt)
        if "SELECT status FROM executions" in query:
            return FakeRow(status=self.status)
        return FakeRow(next_step_index=0)

    async def fetchval(self, query: str, *args: Any) -> int:
        return 1 + sum(1 for sql, _ in self.executed if "INSERT INTO outbox_events" in sql)

    async def fetch(self, query: str, *args: Any) -> list[FakeRow]:
        if "FROM execution_checkpoints" in query:
            return [FakeRow(**row) for row in self.checkpoints]
        if "FROM execution_checkpoint_writes" in query:
            return [FakeRow(**row) for row in self.checkpoint_writes]
        return []

    async def execute(self, query: str, *args: Any) -> str:
        if "SET status='running'" in query:
            self.status = "running"
        if "SET status='completed'" in query:
            self.status = "completed"
        self.executed.append((query, args))
        return "UPDATE 1"

    async def close(self) -> None:
        self.closed = True


def test_run_f1_uses_status_as_authority_and_sends_real_agent_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run_case() -> None:
        conn = FakeConn(row_status="dispatched", row_state="cancelled", agent_id="agent-real")
        seen: dict[str, str] = {}

        async def fake_connect(_dsn: str) -> FakeConn:
            return conn

        async def fake_call_llm(
            *,
            tenant_id: str,
            execution_id: str,
            agent_id: str,
            messages: list[dict[str, Any]],
            snapshot: dict[str, Any],
        ) -> LLMCallResult:
            seen["agent_id"] = agent_id
            return LLMCallResult(
                content="ok",
                tool_calls=None,
                finish_reason="stop",
                usage={"total_tokens": 1},
                provider="fake",
                model="fake/f1-test",
                retry_count=0,
                fallback_level=0,
                accounting_error=False,
            )

        monkeypatch.setenv("DATABASE_URL", "postgres://unit")
        monkeypatch.setattr(f1_runtime.asyncpg, "connect", fake_connect)
        monkeypatch.setattr(f1_runtime, "call_llm", fake_call_llm)

        result = await f1_runtime.run_f1_execution(
            "exec-1", "tenant-1", "trace-1", lease_token="lease-1", attempt=1
        )

        assert result["status"] == "succeeded"
        assert seen["agent_id"] == "agent-real"
        assert any("SET status='running', state='running'" in sql for sql, _ in conn.executed)
        assert any("SET status='completed', state='completed'" in sql for sql, _ in conn.executed)
        assert conn.closed is True

    asyncio.run(run_case())


def test_reclaim_mode_resumes_from_latest_checkpoint(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_case() -> None:
        conn = FakeConn(
            row_status="dispatched",
            checkpoints=[
                {
                    "id": "cp-0",
                    "step_index": 0,
                    "parent_checkpoint_id": None,
                    "state_json": {"messages": [{"role": "user", "content": "hello"}]},
                    "source": "input",
                },
                {
                    "id": "cp-2",
                    "step_index": 2,
                    "parent_checkpoint_id": "cp-0",
                    "state_json": {"messages": [{"role": "assistant", "content": "partial"}]},
                    "source": "loop",
                },
            ],
        )

        async def fake_connect(_dsn: str) -> FakeConn:
            return conn

        async def fake_call_llm(
            *,
            tenant_id: str,
            execution_id: str,
            agent_id: str,
            messages: list[dict[str, Any]],
            snapshot: dict[str, Any],
        ) -> LLMCallResult:
            assert messages == [{"role": "assistant", "content": "partial"}]
            return LLMCallResult(
                content="ok",
                tool_calls=None,
                finish_reason="stop",
                usage={"total_tokens": 1},
                provider="fake",
                model="fake/f1-test",
                retry_count=0,
                fallback_level=0,
                accounting_error=False,
            )

        monkeypatch.setenv("DATABASE_URL", "postgres://unit")
        monkeypatch.setattr(f1_runtime.asyncpg, "connect", fake_connect)
        monkeypatch.setattr(f1_runtime, "call_llm", fake_call_llm)

        result = await f1_runtime.run_f1_execution(
            "exec-1", "tenant-1", "trace-1", mode="reclaim", lease_token="lease-1", attempt=1
        )

        assert result["status"] == "succeeded"
        checkpoint_inserts = [
            args for sql, args in conn.executed if "INSERT INTO execution_checkpoints" in sql
        ]
        assert checkpoint_inserts
        reclaim_checkpoint_args = checkpoint_inserts[0]
        assert reclaim_checkpoint_args[3] == 3
        assert reclaim_checkpoint_args[4] == "reclaim"
        assert reclaim_checkpoint_args[5] == "cp-2"

    asyncio.run(run_case())


def test_reclaim_mode_fails_terminally_when_lineage_is_broken(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run_case() -> None:
        conn = FakeConn(
            row_status="dispatched",
            checkpoints=[
                {
                    "id": "cp-2",
                    "step_index": 2,
                    "parent_checkpoint_id": "missing",
                    "state_json": {"messages": [{"role": "assistant", "content": "partial"}]},
                    "source": "loop",
                }
            ],
        )

        async def fake_connect(_dsn: str) -> FakeConn:
            return conn

        monkeypatch.setenv("DATABASE_URL", "postgres://unit")
        monkeypatch.setattr(f1_runtime.asyncpg, "connect", fake_connect)

        result = await f1_runtime.run_f1_execution(
            "exec-1", "tenant-1", "trace-1", mode="reclaim", lease_token="lease-1", attempt=1
        )

        assert result["status"] == "failed"
        assert result["error"] == "CHECKPOINT_LINEAGE_BROKEN"
        assert any("error_code='CHECKPOINT_LINEAGE_BROKEN'" in sql for sql, _ in conn.executed)

    asyncio.run(run_case())


def test_stale_runtime_owner_cannot_start_or_write_terminal(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def run_case() -> None:
        conn = FakeConn(row_status="dispatched", lease_token="current-token", attempt=2)

        async def fake_connect(_dsn: str) -> FakeConn:
            return conn

        async def fake_call_llm(**_kwargs: Any) -> LLMCallResult:
            raise AssertionError("stale owner must not call LLM")

        monkeypatch.setenv("DATABASE_URL", "postgres://unit")
        monkeypatch.setattr(f1_runtime.asyncpg, "connect", fake_connect)
        monkeypatch.setattr(f1_runtime, "call_llm", fake_call_llm)

        result = await f1_runtime.run_f1_execution(
            "exec-1",
            "tenant-1",
            "trace-1",
            lease_token="old-token",
            attempt=1,
        )

        assert result == {"status": "lost_ownership", "reason": "STALE_OWNERSHIP"}
        assert not any("ExecutionSucceeded" in str(args) for _sql, args in conn.executed)
        assert not any("SET status='completed'" in sql for sql, _args in conn.executed)

    asyncio.run(run_case())


def test_invalid_transition_is_rejected_by_contract() -> None:
    with pytest.raises(InvalidExecutionTransitionError):
        validate_transition("completed", "running")


def test_accounting_warning_emits_observable_outbox_event(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_case() -> None:
        conn = FakeConn(row_status="dispatched")

        async def fake_connect(_dsn: str) -> FakeConn:
            return conn

        async def fake_call_llm(
            *,
            tenant_id: str,
            execution_id: str,
            agent_id: str,
            messages: list[dict[str, Any]],
            snapshot: dict[str, Any],
        ) -> LLMCallResult:
            return LLMCallResult(
                content="ok",
                tool_calls=None,
                finish_reason="stop",
                usage={
                    "total_tokens": 1,
                    "estimated_cost_usd": "0.01",
                    "model": "fake/f1-test",
                    "attempted_models": ["fake/f1-test"],
                    "budget_policy": {"max_usd_per_run": "1.00"},
                },
                provider="fake",
                model="fake/f1-test",
                retry_count=0,
                fallback_level=0,
                accounting_error=True,
                accounting_error_reason="missing usage fields: completion_tokens",
            )

        monkeypatch.setenv("DATABASE_URL", "postgres://unit")
        monkeypatch.setattr(f1_runtime.asyncpg, "connect", fake_connect)
        monkeypatch.setattr(f1_runtime, "call_llm", fake_call_llm)

        result = await f1_runtime.run_f1_execution(
            "exec-1", "tenant-1", "trace-1", lease_token="lease-1", attempt=1
        )

        assert result["status"] == "succeeded"
        outbox_event_types = [
            args[3] for sql, args in conn.executed if "INSERT INTO outbox_events" in sql
        ]
        assert "ExecutionAccountingWarning" in outbox_event_types
        completed_updates = [
            args
            for sql, args in conn.executed
            if "token_usage=$5::jsonb" in sql and "SET status='completed'" in sql
        ]
        assert completed_updates
        assert '"estimated_cost_usd": "0.01"' in completed_updates[0][4]
        assert '"budget_policy": {"max_usd_per_run": "1.00"}' in completed_updates[0][4]

    asyncio.run(run_case())
