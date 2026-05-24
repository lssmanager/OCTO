from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


class ExecutionCheckpoint(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    execution_id: str
    tenant_id: str
    step_index: int = Field(ge=0)
    source: Literal["input", "loop", "tool", "approval", "reclaim", "final"]
    parent_checkpoint_id: str | None = None
    state_json: dict[str, Any]
    channel_versions: dict[str, int | str]
    versions_seen: dict[str, dict[str, int | str]]
    metadata_json: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class CheckpointWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str
    checkpoint_id: str
    tenant_id: str
    task_id: str
    task_path: str = ""
    write_index: int = Field(ge=0)
    channel: str
    type: str | None = None
    value_json: Any = None


class CheckpointTuple(BaseModel):
    checkpoint: ExecutionCheckpoint
    pending_writes: list[CheckpointWrite]
    parent_checkpoint: ExecutionCheckpoint | None = None
