from pydantic import BaseModel

class ExecutionCheckpoint(BaseModel):
    id: str
    tenant_id: str
    execution_id: str
    step_index: int
    source: str
    parent_checkpoint_id: str | None = None
    state_json: dict
    metadata_json: dict = {}

class CheckpointWrite(BaseModel):
    id: str
    tenant_id: str
    checkpoint_id: str
    task_id: str
    write_index: int
    channel: str
    value_json: dict

class CheckpointTuple(BaseModel):
    checkpoint: ExecutionCheckpoint
    writes: list[CheckpointWrite] = []
