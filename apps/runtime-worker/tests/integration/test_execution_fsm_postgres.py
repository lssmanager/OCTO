import asyncio
import os

import pytest

from app.fsm.errors import InvalidTransitionError
from app.fsm.execution_fsm import ExecutionFSM

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")

if not TEST_DATABASE_URL:
    pytestmark = pytest.mark.skip(reason="TEST_DATABASE_URL is not set")


async def _pool():
    asyncpg = pytest.importorskip("asyncpg")
    return await asyncpg.create_pool(TEST_DATABASE_URL)


async def _seed_execution(conn, execution_id: str, tenant_id: str, state: str = "queued", version: int = 0) -> None:
    await conn.execute(
        """
        INSERT INTO executions (
          id, tenant_id, agent_id, agent_version_id, status, state, version,
          attempt_count, reclaim_count, budget_snapshot_json,
          context_snapshot_json, created_by, created_at, updated_at
        ) VALUES ($1,$2,'agent-1','agent-v1',$3::execution_status,$3,$4,0,0,'{}'::jsonb,'{}'::jsonb,'test',now(),now())
        ON CONFLICT (id) DO NOTHING
        """,
        execution_id, tenant_id, state, version,
    )


async def _run_case() -> None:
    pool = await _pool()
    try:
        async with pool.acquire() as conn:
            await _seed_execution(conn, "f1-cas-success", "tenant-a")
        fsm = ExecutionFSM(pool)
        r1 = await fsm.transition("f1-cas-success", "tenant-a", "queued", "dispatched", 0)
        assert r1.success is True and r1.new_version == 1

        async with pool.acquire() as conn:
            await _seed_execution(conn, "f1-cas-conflict", "tenant-a")
            before = await conn.fetchval("SELECT COUNT(*) FROM execution_steps WHERE execution_id=$1", "f1-cas-conflict")
        r2 = await fsm.transition("f1-cas-conflict", "tenant-a", "queued", "dispatched", 999)
        assert r2.success is False and r2.conflict is True
        async with pool.acquire() as conn:
            after = await conn.fetchval("SELECT COUNT(*) FROM execution_steps WHERE execution_id=$1", "f1-cas-conflict")
        assert before == after

        async with pool.acquire() as conn:
            await _seed_execution(conn, "f1-tenant-iso", "tenant-a")
        r3 = await fsm.transition("f1-tenant-iso", "tenant-b", "queued", "dispatched", 0)
        assert r3.success is False and r3.conflict is True

        async with pool.acquire() as conn:
            await _seed_execution(conn, "f1-terminal", "tenant-a", state="completed", version=3)
        with pytest.raises(InvalidTransitionError):
            await fsm.transition("f1-terminal", "tenant-a", "completed", "running", 3)
    finally:
        await pool.close()


def test_execution_fsm_postgres_integration() -> None:
    asyncio.run(_run_case())
