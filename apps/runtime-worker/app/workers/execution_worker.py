from __future__ import annotations

import logging
from datetime import UTC, datetime
from uuid import uuid4

from app.checkpoints.models import ExecutionCheckpoint
from app.checkpoints.service import ICheckpointService
from app.fsm.execution_fsm import ExecutionFSM
from app.lease.heartbeat import HeartbeatEmitter


async def handle_execute(job_data: dict[str, object], ctx: dict[str, object]) -> None:
    logger = ctx.get("logger", logging.getLogger(__name__))
    execution_id = str(job_data["executionId"])
    tenant_id = str(job_data["tenantId"])
    attempt_number = int(job_data.get("attemptNumber", 1))
    worker_id = str(ctx.get("worker_id", "runtime-local"))
    db_pool = ctx["db_pool"]
    fsm = ExecutionFSM(db_pool, logger=logger)
    checkpoint_service: ICheckpointService = ctx["checkpoint_service"]

    execution = await fsm.load_context(execution_id, tenant_id)
    if execution is None:
        logger.warning("runtime_execute_missing_execution", extra={"executionId": execution_id, "tenantId": tenant_id})
        return

    result = await fsm.transition(
        execution_id=execution_id,
        tenant_id=tenant_id,
        expected_state="dispatched",
        next_state="running",
        expected_version=execution.version,
        lease_owner=worker_id,
        metadata={"attemptNumber": attempt_number},
    )
    if not result.success:
        logger.warning("execute_cas_conflict", extra={"executionId": execution_id, "tenantId": tenant_id})
        return

    checkpoint = ExecutionCheckpoint(
        id=str(uuid4()),
        execution_id=execution_id,
        tenant_id=tenant_id,
        step_index=1,
        source="input",
        state_json={"input": getattr(execution, "context_snapshot", {})},
        channel_versions={},
        versions_seen={},
        metadata_json={"attemptNumber": attempt_number, "workerId": worker_id},
        created_at=datetime.now(UTC),
    )
    await checkpoint_service.put(checkpoint, [])

    hb = HeartbeatEmitter(db_pool, execution_id, tenant_id, worker_id, logger=logger)
    await hb.start()
    try:
        engine = ctx.get("execution_engine")
        if engine is None:
            raise NotImplementedError("execution engine not implemented")
        await engine.run(execution_id=execution_id, tenant_id=tenant_id)
    finally:
        await hb.stop()
