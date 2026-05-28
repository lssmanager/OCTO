from dataclasses import dataclass
from datetime import datetime
from typing import Any

TERMINAL_STATES = {
    "completed",
    "failed",
    "cancelled",
}

VALID_TRANSITIONS = {
    "pending": {"queued", "cancelled"},
    "queued": {"dispatched", "cancelled", "failed"},
    "dispatched": {"running", "failed", "cancelled"},
    "running": {
        "waiting_tool",
        "waiting_human",
        "retrying",
        "reclaimable",
        "suspended",
        "completed",
        "failed",
        "cancelled",
    },
    "waiting_tool": {"running", "retrying", "failed", "cancelled", "suspended"},
    "waiting_human": {"running", "cancelled", "suspended"},
    "retrying": {"retry_scheduled", "failed", "cancelled"},
    "retry_scheduled": {"queued", "failed", "cancelled"},
    "reclaimable": {"retrying", "failed", "cancelled"},
    "suspended": {"queued", "cancelled"},
    "completed": set(),
    "failed": set(),
    "cancelled": set(),
}


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
