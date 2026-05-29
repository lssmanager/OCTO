from __future__ import annotations

import asyncio
from dataclasses import dataclass
from typing import Any
import sys
import types

import pytest

sys.modules.setdefault("asyncpg", types.SimpleNamespace(Connection=object, connect=None))
sys.modules.setdefault("structlog", types.SimpleNamespace(get_logger=lambda _name=None: types.SimpleNamespace(info=lambda *a, **k: None, exception=lambda *a, **k: None)))
sys.modules.setdefault("jsonschema", types.SimpleNamespace(validate=lambda **_kwargs: None, ValidationError=ValueError))

from src import f1_runtime
from src.fsm_contract import InvalidExecutionTransitionError, validate_transition
from src.llm_provider import LLMCallResult


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
            )
        if "UPDATE executions" in query and "RETURNING version" in query:
            self.status = "running"
            self.executed.append((query, args))
            return FakeRow(version=8)
        if "SELECT status FROM executions" in query:
            return FakeRow(status=self.status)
        return FakeRow(next_step_index=0)

    async def fetchval(self, query: str, *args: Any) -> int:
        return 1 + sum(1 for sql, _ in self.executed if "INSERT INTO outbox_events" in sql)

    async def fetch(self, query: str, *args: Any) -> list[FakeRow]:
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


def test_run_f1_uses_status_as_authority_and_sends_real_agent_id(monkeypatch: pytest.MonkeyPatch) -> None:
    async def run_case() -> None:
        conn = FakeConn(row_status="dispatched", row_state="cancelled", agent_id="agent-real")
        seen: dict[str, str] = {}

        async def fake_connect(_dsn: str) -> FakeConn:
            return conn

        async def fake_call_llm(*, tenant_id: str, execution_id: str, agent_id: str, messages: list[dict[str, Any]], snapshot: dict[str, Any]) -> LLMCallResult:
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

        result = await f1_runtime.run_f1_execution("exec-1", "tenant-1", "trace-1")

        assert result["status"] == "succeeded"
        assert seen["agent_id"] == "agent-real"
        assert any("SET status='running', state='running'" in sql for sql, _ in conn.executed)
        assert any("SET status='completed', state='completed'" in sql for sql, _ in conn.executed)
        assert conn.closed is True

    asyncio.run(run_case())

def test_invalid_transition_is_rejected_by_contract() -> None:
    with pytest.raises(InvalidExecutionTransitionError):
        validate_transition("completed", "running")
