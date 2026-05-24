from __future__ import annotations

from .errors import CheckpointLineageError, CheckpointNotFoundError
from .models import CheckpointTuple
from .service import ICheckpointService


async def recover_from_checkpoint(
    service: ICheckpointService,
    execution_id: str,
    tenant_id: str,
) -> CheckpointTuple:
    checkpoint_tuple = await service.get_latest(execution_id=execution_id, tenant_id=tenant_id)
    if checkpoint_tuple is None:
        raise CheckpointNotFoundError("no checkpoint found")
    is_valid = await service.validate_lineage(checkpoint_tuple.checkpoint)
    if not is_valid:
        raise CheckpointLineageError("invalid checkpoint lineage for recovery")
    return checkpoint_tuple
