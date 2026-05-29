from __future__ import annotations

from uuid import uuid4


class ApprovalService:
    def __init__(self, pool: object) -> None:
        self.pool = pool

    async def request_budget_override(self, tenant_id: str, execution_id: str, agent_id: str, step_index: int, checkpoint_id: str | None, budget_result: object, trace_id: str) -> str:
        approval_id = str(uuid4())
        async with self.pool.acquire() as conn:
            async with conn.transaction():
                await conn.execute("UPDATE executions SET status='waiting_human', state='waiting_human', updated_at=now() WHERE id=$1 AND tenant_id=$2", execution_id, tenant_id)
                await conn.execute(
                    "INSERT INTO approvals (id,tenant_id,execution_id,approval_type,status,payload_json,created_at) VALUES ($1,$2,$3,'budget_override','PENDING',$4::jsonb,now())",
                    approval_id, tenant_id, execution_id,
                    {"agent_id": agent_id, "step_index": step_index, "reason": "LLM_BUDGET_EXCEEDED", "trace_id": trace_id},
                )
                await conn.execute("INSERT INTO outbox_events (id,tenant_id,aggregate_type,aggregate_id,event_type,sequence,payload_json) VALUES (gen_random_uuid()::text,$1,'Execution',$2,'ApprovalRequested',(SELECT COALESCE(MAX(sequence),0)+1 FROM outbox_events WHERE tenant_id=$1 AND aggregate_type='Execution' AND aggregate_id=$2),$3::jsonb)", tenant_id, execution_id, {"approval_id": approval_id})
        return approval_id
