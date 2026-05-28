from datetime import UTC, datetime

import pytest

from app.fsm.errors import InvalidTransitionError
from app.fsm.execution_fsm import ExecutionFSM
from app.fsm.types import ExecutionContext, TERMINAL_STATES, VALID_TRANSITIONS


def _context(state: str, cancellation_requested_at=None) -> ExecutionContext:
    now = datetime.now(UTC)
    return ExecutionContext(
        execution_id="e1",
        tenant_id="t1",
        agent_id="a1",
        agent_version_id="av1",
        state=state,
        version=1,
        attempt_count=0,
        reclaim_count=0,
        lease_owner=None,
        lease_expires_at=None,
        cancellation_requested_at=cancellation_requested_at,
        budget_snapshot={},
        context_snapshot={},
        created_by="tester",
        created_at=now,
        updated_at=now,
    )


def test_valid_transitions() -> None:
    for source, targets in VALID_TRANSITIONS.items():
        for target in targets:
            ExecutionFSM._validate_transition(source, target)


def test_invalid_transition_raises() -> None:
    with pytest.raises(InvalidTransitionError):
        ExecutionFSM._validate_transition("queued", "running")


def test_terminal_state_no_exit() -> None:
    for terminal in TERMINAL_STATES:
        assert VALID_TRANSITIONS[terminal] == set()
        with pytest.raises(InvalidTransitionError):
            ExecutionFSM._validate_transition(terminal, "running")


def test_execution_context_is_terminal() -> None:
    assert _context("completed").is_terminal is True
    assert _context("running").is_terminal is False


def test_execution_context_cancellation_requested() -> None:
    assert _context("running", cancellation_requested_at=datetime.now(UTC)).cancellation_requested is True
    assert _context("running", cancellation_requested_at=None).cancellation_requested is False
