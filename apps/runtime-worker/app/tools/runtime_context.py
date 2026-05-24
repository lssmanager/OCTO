from __future__ import annotations

from enum import Enum
from typing import Any

from pydantic import BaseModel


class ToolInvocationStatus(str, Enum):
    PENDING = "PENDING"
    VALIDATED = "VALIDATED"
    AUTHORIZED = "AUTHORIZED"
    APPROVAL_REQUIRED = "APPROVAL_REQUIRED"
    RUNNING = "RUNNING"
    PENDING_ASYNC = "PENDING_ASYNC"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"
    TIMED_OUT = "TIMED_OUT"
    CANCELLED = "CANCELLED"


class ToolExecutionMode(str, Enum):
    SYNC = "sync"
    ASYNC = "async"


class ToolRuntimeContext(BaseModel):
    tenant_id: str
    execution_id: str
    agent_id: str
    step_id: str
    step_index: int
    trace_id: str
    worker_id: str
    tool_invocation_id: str
    idempotency_key: str
    replay_mode: bool = False
    allow_side_effects: bool = True
    workdir_root: str = "/tmp/octo-tools"
    stdout_limit_bytes: int = 64_000
    stderr_limit_bytes: int = 64_000


class ToolExecutionRequest(BaseModel):
    tool_name: str
    arguments_json: dict[str, Any]
    raw_tool_call_id: str | None = None
    execution_mode: ToolExecutionMode = ToolExecutionMode.SYNC


class ToolExecutionResult(BaseModel):
    status: ToolInvocationStatus
    result_json: dict[str, Any] | None = None
    error_code: str | None = None
    error_message: str | None = None
    retryable: bool = False
    stdout: str | None = None
    stderr: str | None = None
    exit_code: int | None = None
    started_at: str | None = None
    completed_at: str | None = None
    duration_ms: int | None = None
    output_schema_valid: bool = False
    sanitized: bool = True
