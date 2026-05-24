from .errors import CheckpointLineageError, CheckpointNotFoundError
from .models import ExecutionCheckpoint, CheckpointWrite, CheckpointTuple

class ICheckpointService:
    async def put(self, checkpoint: ExecutionCheckpoint, writes: list[CheckpointWrite]): ...

class PostgresCheckpointService(ICheckpointService):
    def __init__(self, db): self.db = db
    async def _validate_lineage(self, c: ExecutionCheckpoint):
        if not c.parent_checkpoint_id: return
        p = await self.db.fetchrow("SELECT id, tenant_id, execution_id FROM execution_checkpoints WHERE id=$1", c.parent_checkpoint_id)
        if not p or p['tenant_id'] != c.tenant_id or p['execution_id'] != c.execution_id:
            raise CheckpointLineageError("invalid parent lineage")
    async def put(self, checkpoint, writes):
        async with self.db.transaction():
            await self._validate_lineage(checkpoint)
            await self.db.execute("INSERT INTO execution_checkpoints(id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,metadata_json) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", checkpoint.id, checkpoint.tenant_id, checkpoint.execution_id, checkpoint.step_index, checkpoint.source, checkpoint.parent_checkpoint_id, checkpoint.state_json, checkpoint.metadata_json)
            for w in writes:
                await self.db.execute("INSERT INTO execution_checkpoint_writes(id,tenant_id,checkpoint_id,task_id,write_index,channel,value_json,task_path) VALUES($1,$2,$3,$4,$5,$6,$7,'')", w.id, w.tenant_id, w.checkpoint_id, w.task_id, w.write_index, w.channel, w.value_json)
    async def get_latest(self, execution_id, tenant_id):
        row = await self.db.fetchrow("SELECT * FROM execution_checkpoints WHERE execution_id=$1 AND tenant_id=$2 ORDER BY step_index DESC LIMIT 1", execution_id, tenant_id)
        if not row: raise CheckpointNotFoundError()
        return ExecutionCheckpoint(**dict(row))
