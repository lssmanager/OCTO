from app.fsm.execution_fsm import ExecutionFSM
from app.lease.heartbeat import HeartbeatEmitter
from app.checkpoints.models import ExecutionCheckpoint
from app.checkpoints.service import PostgresCheckpointService

class ExecutionWorker:
    def __init__(self, db, worker_id: str): self.db=db; self.worker_id=worker_id
    async def handle_runtime_execute(self, payload: dict):
        execution_id=payload['execution_id']; tenant_id=payload['tenant_id']
        fsm=ExecutionFSM(self.db); ctx=await fsm.load_context(execution_id, tenant_id)
        if not ctx: return
        await fsm.transition(ctx,'RUNNING',worker_id=self.worker_id)
        cps=PostgresCheckpointService(self.db)
        await cps.put(ExecutionCheckpoint(id=payload['checkpoint_id'],tenant_id=tenant_id,execution_id=execution_id,step_index=0,source='input',state_json=payload.get('input',{})),[])
        hb=HeartbeatEmitter(self.db,execution_id,tenant_id,self.worker_id); hb.start()
        try:
            return {'status':'stub_runtime_pending_engine'}
        finally:
            await hb.stop()
