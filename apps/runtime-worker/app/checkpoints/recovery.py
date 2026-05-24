from .service import PostgresCheckpointService

async def recover_from_checkpoint(service: PostgresCheckpointService, execution_id: str, tenant_id: str):
    return await service.get_latest(execution_id, tenant_id)
