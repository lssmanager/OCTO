class DLQRouter:
    async def route(self, db, execution_id: str, tenant_id: str, reason: str, payload: dict):
        await db.execute("INSERT INTO outbox_events(id,tenant_id,aggregate_type,aggregate_id,event_type,sequence,payload_json) VALUES(gen_random_uuid()::text,$1,'execution',$2,'ExecutionDLQ',1,$3)", tenant_id, execution_id, {'reason':reason,'payload':payload})
