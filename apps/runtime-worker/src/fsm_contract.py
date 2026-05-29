"""Execution FSM contract adapter for the F1 runtime.

Uses the generated Python contract when present. The fallback mirrors the F1
contract and exists only so runtime tests can run before `pnpm contracts:validate`
regenerates artifacts.
"""
from __future__ import annotations

try:  # Prefer generated source of truth from packages/contracts.
    from app.contracts.generated.execution_fsm_contract import (  # type: ignore[import-not-found]
        EXECUTION_TERMINAL_STATES,
        EXECUTION_VALID_TRANSITIONS,
    )
except Exception:  # pragma: no cover - only used in stripped test environments
    EXECUTION_TERMINAL_STATES = ("completed", "failed", "cancelled")
    EXECUTION_VALID_TRANSITIONS = {
        "pending": ("queued", "cancelled"),
        "queued": ("dispatched", "cancelled", "failed"),
        "dispatched": ("running", "cancelled", "failed"),
        "running": (
            "waiting_tool",
            "waiting_human",
            "retrying",
            "reclaimable",
            "suspended",
            "completed",
            "failed",
            "cancelled",
        ),
        "waiting_tool": ("running", "retrying", "failed", "cancelled", "suspended"),
        "waiting_human": ("running", "cancelled", "suspended"),
        "retrying": ("retry_scheduled", "failed", "cancelled"),
        "retry_scheduled": ("queued", "failed", "cancelled"),
        "reclaimable": ("retrying", "failed", "cancelled"),
        "suspended": ("queued", "cancelled"),
        "completed": (),
        "failed": (),
        "cancelled": (),
    }

TERMINAL_STATES = set(EXECUTION_TERMINAL_STATES)
VALID_TRANSITIONS = {state: set(targets) for state, targets in EXECUTION_VALID_TRANSITIONS.items()}


class InvalidExecutionTransitionError(ValueError):
    """Raised when a status transition violates the generated FSM contract."""


def validate_transition(from_status: str, to_status: str) -> None:
    allowed = VALID_TRANSITIONS.get(from_status)
    if allowed is None:
        raise InvalidExecutionTransitionError(f"unknown execution status: {from_status}")
    if from_status in TERMINAL_STATES:
        raise InvalidExecutionTransitionError(f"terminal execution status has no outgoing transitions: {from_status}")
    if to_status not in allowed:
        raise InvalidExecutionTransitionError(f"invalid execution transition {from_status} -> {to_status}")
