from dataclasses import dataclass
from datetime import datetime
from typing import Any

TERMINAL_STATES = {
    "TIMED_OUT",
    "SUCCEEDED",
    "FAILED",
    "CANCELLED",
    "DLQ",
}

VALID_TRANSITIONS = {
    "QUEUED": {"DISPATCHED", "CANCELLED"},
    "DISPATCHED": {"RUNNING", "FAILED", "CANCELLED"},
    "RUNNING": {
        "PAUSED",
        "RETRY_SCHEDULED",
        "RECLAIMING",
        "TIMED_OUT",
        "SUCCEEDED",
        "FAILED",
        "CANCELLED",
    },
    "PAUSED": {"RUNNING", "CANCELLED", "FAILED"},
    "RETRY_SCHEDULED": {"DISPATCHED", "FAILED"},
    "RECLAIMING": {"RUNNING", "FAILED"},
    "TIMED_OUT": set(),
    "SUCCEEDED": set(),
    "FAILED": set(),
    "CANCELLED": set(),
    "DLQ": set(),
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
