from dataclasses import dataclass
from datetime import datetime
from typing import Any

from app.contracts.generated.execution_fsm_contract import (
    EXECUTION_TERMINAL_STATES,
    EXECUTION_VALID_TRANSITIONS,
)

TERMINAL_STATES = set(EXECUTION_TERMINAL_STATES)
VALID_TRANSITIONS = {state: set(targets) for state, targets in EXECUTION_VALID_TRANSITIONS.items()}


@dataclass(frozen=True)
class CASResult:
    success: bool
    conflict: bool
    new_version: int | None
    previous_state: str | None = None
    next_state: str | None = None
    execution_id: str | None = None


@dataclass(frozen=True)
class ExecutionContext:
    execution_id: str
    tenant_id: str
    agent_id: str
    agent_version_id: str
    state: str
    version: int
    attempt_count: int
    reclaim_count: int
    lease_owner: str | None
    lease_expires_at: datetime | None
    cancellation_requested_at: datetime | None
    budget_snapshot: dict[str, Any]
    context_snapshot: dict[str, Any]
    created_by: str
    created_at: datetime
    updated_at: datetime

    @property
    def is_terminal(self) -> bool:
        return self.state in TERMINAL_STATES

    @property
    def cancellation_requested(self) -> bool:
        return self.cancellation_requested_at is not None
