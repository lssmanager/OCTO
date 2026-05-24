from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Any, Protocol, cast, List

from pydantic import ValidationError

from .errors import (
    CheckpointLineageError,
    CheckpointNotFoundError,
    CheckpointPersistenceError,
    CheckpointValidationError,
)
from .models import CheckpointTuple, CheckpointWrite, ExecutionCheckpoint


class _PoolLike(Protocol):
    def acquire(self) -> Any: ...


class ICheckpointService(ABC):
    @abstractmethod
    async def put(self, checkpoint: ExecutionCheckpoint, writes: List[CheckpointWrite]) -> ExecutionCheckpoint: ...

    @abstractmethod
    async def get_latest(self, execution_id: str, tenant_id: str) -> CheckpointTuple | None: ...

    @abstractmethod
    async def get_by_id(self, checkpoint_id: str, tenant_id: str) -> CheckpointTuple | None: ...

    @abstractmethod
    async def list(self, execution_id: str, tenant_id: str, limit: int = 50) -> List[ExecutionCheckpoint]: ...

    @abstractmethod
    async def put_writes(self, checkpoint_id: str, tenant_id: str, writes: List[CheckpointWrite]) -> None: ...

    @abstractmethod
    async def validate_lineage(self, checkpoint: ExecutionCheckpoint) -> bool: ...


class PostgresCheckpointService(ICheckpointService):
    def __init__(self, db_pool: _PoolLike, logger: logging.Logger | None = None):
        self._db_pool = db_pool
        self._logger = logger or logging.getLogger(__name__)

    @staticmethod
    def _to_checkpoint(row: Any) -> ExecutionCheckpoint:
        return cast(ExecutionCheckpoint, ExecutionCheckpoint.model_validate(dict(row)))

    async def _load_writes(self, conn: Any, checkpoint_id: str, tenant_id: str) -> List[CheckpointWrite]:
        rows = await conn.fetch(
            "SELECT id,checkpoint_id,tenant_id,task_id,task_path,write_index,channel,type,value_json FROM execution_checkpoint_writes WHERE checkpoint_id=$1 AND tenant_id=$2 ORDER BY write_index ASC",
            checkpoint_id,
            tenant_id,
        )
        return [cast(CheckpointWrite, CheckpointWrite.model_validate(dict(r))) for r in rows]

    async def _validate_lineage_conn(self, conn: Any, checkpoint: ExecutionCheckpoint) -> bool:
        if checkpoint.parent_checkpoint_id is None:
            return True
        row = await conn.fetchrow(
            "SELECT id,tenant_id,execution_id FROM execution_checkpoints WHERE id=$1 AND tenant_id=$2",
            checkpoint.parent_checkpoint_id,
            checkpoint.tenant_id,
        )
        if row is None:
            return False
        return bool(row["execution_id"] == checkpoint.execution_id)

    async def validate_lineage(self, checkpoint: ExecutionCheckpoint) -> bool:
        async with self._db_pool.acquire() as conn:
            return await self._validate_lineage_conn(conn, checkpoint)

    async def put(self, checkpoint: ExecutionCheckpoint, writes: List[CheckpointWrite]) -> ExecutionCheckpoint:
        try:
            checkpoint = ExecutionCheckpoint.model_validate(checkpoint)
            writes = [CheckpointWrite.model_validate(w) for w in writes]
        except ValidationError as exc:
            raise CheckpointValidationError(str(exc)) from exc
        for write in writes:
            if write.tenant_id != checkpoint.tenant_id or write.checkpoint_id != checkpoint.id:
                raise CheckpointValidationError("write tenant_id/checkpoint_id mismatch")

        async with self._db_pool.acquire() as conn:
            try:
                async with conn.transaction():
                    if checkpoint.parent_checkpoint_id and not await self._validate_lineage_conn(conn, checkpoint):
                        self._logger.warning("invalid_checkpoint_lineage", extra={"tenant_id": checkpoint.tenant_id, "execution_id": checkpoint.execution_id, "checkpoint_id": checkpoint.id, "parent_checkpoint_id": checkpoint.parent_checkpoint_id})
                        raise CheckpointLineageError("invalid parent lineage")
                    await conn.execute(
                        "INSERT INTO execution_checkpoints (id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,channel_versions,versions_seen,metadata_json,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9::jsonb,$10::jsonb,$11)",
                        checkpoint.id, checkpoint.tenant_id, checkpoint.execution_id, checkpoint.step_index, checkpoint.source, checkpoint.parent_checkpoint_id, checkpoint.state_json, checkpoint.channel_versions, checkpoint.versions_seen, checkpoint.metadata_json, checkpoint.created_at,
                    )
                    if writes:
                        await conn.executemany(
                            "INSERT INTO execution_checkpoint_writes (id,checkpoint_id,tenant_id,task_id,task_path,write_index,channel,type,value_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
                            [(w.id, w.checkpoint_id, w.tenant_id, w.task_id, w.task_path, w.write_index, w.channel, w.type, w.value_json) for w in writes],
                        )
            except CheckpointLineageError:
                raise
            except Exception as exc:
                self._logger.error("checkpoint_persistence_failure", extra={"tenant_id": checkpoint.tenant_id, "execution_id": checkpoint.execution_id, "checkpoint_id": checkpoint.id, "error_class": exc.__class__.__name__})
                raise CheckpointPersistenceError(str(exc)) from exc
        return checkpoint

    async def get_latest(self, execution_id: str, tenant_id: str) -> CheckpointTuple | None:
        async with self._db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,channel_versions,versions_seen,metadata_json,created_at FROM execution_checkpoints WHERE execution_id=$1 AND tenant_id=$2 ORDER BY step_index DESC, created_at DESC LIMIT 1",
                execution_id,
                tenant_id,
            )
            if row is None:
                return None
            checkpoint = self._to_checkpoint(row)
            writes = await self._load_writes(conn, checkpoint.id, tenant_id)
            parent = None
            if checkpoint.parent_checkpoint_id:
                prow = await conn.fetchrow(
                    "SELECT id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,channel_versions,versions_seen,metadata_json,created_at FROM execution_checkpoints WHERE id=$1 AND tenant_id=$2",
                    checkpoint.parent_checkpoint_id,
                    tenant_id,
                )
                if prow is not None:
                    parent = self._to_checkpoint(prow)
            return CheckpointTuple(checkpoint=checkpoint, pending_writes=writes, parent_checkpoint=parent)

    async def get_by_id(self, checkpoint_id: str, tenant_id: str) -> CheckpointTuple | None:
        async with self._db_pool.acquire() as conn:
            row = await conn.fetchrow(
                "SELECT id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,channel_versions,versions_seen,metadata_json,created_at FROM execution_checkpoints WHERE id=$1 AND tenant_id=$2",
                checkpoint_id,
                tenant_id,
            )
            if row is None:
                return None
            checkpoint = self._to_checkpoint(row)
            writes = await self._load_writes(conn, checkpoint.id, tenant_id)
            parent = None
            if checkpoint.parent_checkpoint_id:
                prow = await conn.fetchrow(
                    "SELECT id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,channel_versions,versions_seen,metadata_json,created_at FROM execution_checkpoints WHERE id=$1 AND tenant_id=$2",
                    checkpoint.parent_checkpoint_id,
                    tenant_id,
                )
                if prow is not None:
                    parent = self._to_checkpoint(prow)
            return CheckpointTuple(checkpoint=checkpoint, pending_writes=writes, parent_checkpoint=parent)

    async def list(self, execution_id: str, tenant_id: str, limit: int = 50) -> List[ExecutionCheckpoint]:
        safe_limit = max(1, min(limit, 500))
        async with self._db_pool.acquire() as conn:
            rows = await conn.fetch(
                "SELECT id,tenant_id,execution_id,step_index,source,parent_checkpoint_id,state_json,channel_versions,versions_seen,metadata_json,created_at FROM execution_checkpoints WHERE execution_id=$1 AND tenant_id=$2 ORDER BY step_index DESC, created_at DESC LIMIT $3",
                execution_id,
                tenant_id,
                safe_limit,
            )
        return [self._to_checkpoint(r) for r in rows]

    async def put_writes(self, checkpoint_id: str, tenant_id: str, writes: List[CheckpointWrite]) -> None:
        writes = [CheckpointWrite.model_validate(w) for w in writes]
        for write in writes:
            if write.tenant_id != tenant_id or write.checkpoint_id != checkpoint_id:
                raise CheckpointValidationError("write tenant_id/checkpoint_id mismatch")
        async with self._db_pool.acquire() as conn:
            async with conn.transaction():
                exists = await conn.fetchrow(
                    "SELECT id FROM execution_checkpoints WHERE id=$1 AND tenant_id=$2",
                    checkpoint_id,
                    tenant_id,
                )
                if exists is None:
                    raise CheckpointNotFoundError("checkpoint not found")
                if writes:
                    try:
                        await conn.executemany(
                            "INSERT INTO execution_checkpoint_writes (id,checkpoint_id,tenant_id,task_id,task_path,write_index,channel,type,value_json) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)",
                            [(w.id, w.checkpoint_id, w.tenant_id, w.task_id, w.task_path, w.write_index, w.channel, w.type, w.value_json) for w in writes],
                        )
                    except Exception as exc:
                        raise CheckpointPersistenceError(str(exc)) from exc
