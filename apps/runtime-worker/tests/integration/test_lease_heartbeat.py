import asyncio
import os
from datetime import UTC, datetime, timedelta

import pytest

from app.lease.errors import LeaseRevokedError
from app.lease.heartbeat import HeartbeatEmitter

TEST_DATABASE_URL = os.getenv("TEST_DATABASE_URL")
if not TEST_DATABASE_URL:
    pytestmark = pytest.mark.skip(reason="TEST_DATABASE_URL is not set")


async def _pool():
    asyncpg = pytest.importorskip("asyncpg")
    return await asyncpg.create_pool(TEST_DATABASE_URL)


async def _seed_execution(conn, execution_id: str, tenant_id: str, state: str, owner: str | None) -> None:
    await conn.execute(
        "INSERT INTO executions (id,tenant_id,agent_id,agent_version_id,status,state,version,attempt_count,reclaim_count,lease_owner,lease_expires_at,budget_snapshot_json,context_snapshot_json,created_by,created_at,updated_at) VALUES ($1,$2,'agent-1','agent-v1',$3::execution_status,$3,0,0,0,$4,now() - interval '5 seconds','{}'::jsonb,'{}'::jsonb,'test',now(),now()) ON CONFLICT (id) DO NOTHING",
        execution_id,
        tenant_id,
        state,
        owner,
    )


async def _run() -> None:
    pool = await _pool()
    try:
        async with pool.acquire() as conn:
            await _seed_execution(conn, "hb-1", "tenant-a", "running", "worker-a")
            before = await conn.fetchval("SELECT lease_expires_at FROM executions WHERE id='hb-1' AND tenant_id='tenant-a'")
        hb = HeartbeatEmitter(pool, "hb-1", "tenant-a", "worker-a")
        await hb.renew_once()
        async with pool.acquire() as conn:
            after = await conn.fetchval("SELECT lease_expires_at FROM executions WHERE id='hb-1' AND tenant_id='tenant-a'")
        assert after > before

        async with pool.acquire() as conn:
            await _seed_execution(conn, "hb-2", "tenant-a", "running", "worker-b")
        hb_wrong = HeartbeatEmitter(pool, "hb-2", "tenant-a", "worker-a")
        with pytest.raises(LeaseRevokedError):
            await hb_wrong.renew_once()

        async with pool.acquire() as conn:
            await _seed_execution(conn, "hb-3", "tenant-a", "dispatched", "worker-a")
        hb_non_running = HeartbeatEmitter(pool, "hb-3", "tenant-a", "worker-a")
        with pytest.raises(LeaseRevokedError):
            await hb_non_running.renew_once()

        hb_idempotent = HeartbeatEmitter(pool, "hb-1", "tenant-a", "worker-a", heartbeat_interval_seconds=1)
        await hb_idempotent.start()
        await asyncio.sleep(0.1)
        await hb_idempotent.stop()
        await hb_idempotent.stop()

        with pytest.raises(LeaseRevokedError):
            await HeartbeatEmitter(pool, "missing", "tenant-a", "worker-a").renew_once()
    finally:
        await pool.close()


def test_lease_heartbeat() -> None:
    asyncio.run(_run())
