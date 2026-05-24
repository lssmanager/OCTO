from dataclasses import dataclass
from typing import Any

TERMINAL_STATES = {"TIMED_OUT", "SUCCEEDED", "FAILED", "CANCELLED", "DLQ"}
VALID_TRANSITIONS = {
    "QUEUED": {"DISPATCHED", "CANCELLED"},
    "DISPATCHED": {"RUNNING", "FAILED", "CANCELLED"},
    "RUNNING": {"PAUSED", "RETRY_SCHEDULED", "RECLAIMING", "TIMED_OUT", "SUCCEEDED", "FAILED", "CANCELLED"},
    "PAUSED": {"RUNNING", "CANCELLED", "FAILED"},
    "RETRY_SCHEDULED": {"DISPATCHED", "FAILED"},
    "RECLAIMING": {"RUNNING", "FAILED"},
    "TIMED_OUT": set(), "SUCCEEDED": set(), "FAILED": set(), "CANCELLED": set(), "DLQ": set(),
}

@dataclass
class CASResult:
    success: bool
    conflict: bool = False
    new_version: int | None = None

@dataclass
class ExecutionContext:
    id: str
    tenant_id: str
    state: str
    version: int
    lease_owner: str | None = None
    lease_expires_at: Any | None = None
