import asyncio
import os
from datetime import UTC, datetime

import pytest

from app.checkpoints.errors import CheckpointLineageError, CheckpointNotFoundError
from app.checkpoints.models import CheckpointWrite, ExecutionCheckpoint
from app.checkpoints.recovery import recover_from_checkpoint
from app.checkpoints.service import PostgresCheckpointService

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pytestmark = pytest.mark.skip(reason="TEST_DATABASE_URL is not set")


async def _pool():
    asyncpg = pytest.importorskip("asyncpg")
    return await asyncpg.create_pool(TEST_DATABASE_URL)


async def _seed_execution(conn, execution_id: str, tenant_id: str) -> None:
    await conn.execute(
        "INSERT INTO executions (id,tenant_id,agent_id,agent_version_id,state,version,attempt_count,reclaim_count,budget_snapshot_json,context_snapshot_json,created_by,created_at,updated_at) VALUES ($1,$2,'agent-1','agent-v1','running',0,0,0,'{}'::jsonb,'{}'::jsonb,'test',now(),now()) ON CONFLICT (id) DO NOTHING",
        execution_id,
        tenant_id,
    )


def _cp(cp_id: str, execution_id: str, tenant_id: str, step_index: int, parent: str | None = None):
    return ExecutionCheckpoint(id=cp_id, execution_id=execution_id, tenant_id=tenant_id, step_index=step_index, source="loop", parent_checkpoint_id=parent, state_json={}, channel_versions={"main": step_index}, versions_seen={"n": {"main": step_index}}, metadata_json={}, created_at=datetime.now(UTC))


def _write(wid: str, cp_id: str, tenant_id: str, idx: int):
    return CheckpointWrite(id=wid, checkpoint_id=cp_id, tenant_id=tenant_id, task_id="task", write_index=idx, channel="main", value_json={"i": idx})


async def _run() -> None:
    pool = await _pool()
    svc = PostgresCheckpointService(pool)
    try:
        async with pool.acquire() as conn:
            await _seed_execution(conn, "exec-a", "tenant-a")
            await _seed_execution(conn, "exec-b", "tenant-a")
            await _seed_execution(conn, "exec-a", "tenant-b")

        cp1 = _cp("cp-1", "exec-a", "tenant-a", 1)
        await svc.put(cp1, [])
        latest = await svc.get_latest("exec-a", "tenant-a")
        assert latest is not None and latest.checkpoint.id == "cp-1"

        cp2 = _cp("cp-2", "exec-a", "tenant-a", 2, parent="cp-1")
        await svc.put(cp2, [_write("w2", "cp-2", "tenant-a", 2), _write("w1", "cp-2", "tenant-a", 1)])
        latest2 = await svc.get_latest("exec-a", "tenant-a")
        assert [w.write_index for w in latest2.pending_writes] == [1, 2]

        bad = _cp("cp-bad", "exec-a", "tenant-a", 3, parent="cp-2")
        with pytest.raises(Exception):
            await svc.put(bad, [CheckpointWrite(id="wbad", checkpoint_id="cp-2", tenant_id="tenant-a", task_id="task", write_index=0, channel="main", value_json={})])
        assert await svc.get_by_id("cp-bad", "tenant-a") is None

        wrong_exec = _cp("cp-wrong-exec", "exec-b", "tenant-a", 1, parent="cp-1")
        assert await svc.validate_lineage(wrong_exec) is False
        with pytest.raises(CheckpointLineageError):
            await svc.put(wrong_exec, [])

        wrong_tenant = _cp("cp-wrong-tenant", "exec-a", "tenant-b", 1, parent="cp-1")
        assert await svc.validate_lineage(wrong_tenant) is False
        with pytest.raises(CheckpointLineageError):
            await svc.put(wrong_tenant, [])

        cp3 = _cp("cp-3", "exec-a", "tenant-a", 3, parent="cp-2")
        await svc.put(cp3, [])
        recovered = await recover_from_checkpoint(svc, "exec-a", "tenant-a")
        assert recovered.checkpoint.id == "cp-3"

        with pytest.raises(CheckpointNotFoundError):
            await recover_from_checkpoint(svc, "missing-exec", "tenant-a")

        assert await svc.get_by_id("cp-3", "tenant-b") is None
        ordered = await svc.list("exec-a", "tenant-a")
        assert [c.step_index for c in ordered[:3]] == [3, 2, 1]

        with pytest.raises(CheckpointNotFoundError):
            await svc.put_writes("missing-cp", "tenant-a", [_write("wm", "missing-cp", "tenant-a", 1)])

        with pytest.raises(Exception):
            await svc.put_writes("cp-3", "tenant-a", [_write("wt", "cp-3", "tenant-b", 1)])
    finally:
        await pool.close()


def test_checkpoint_service_integration() -> None:
    asyncio.run(_run())
