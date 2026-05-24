import pytest
from unittest.mock import AsyncMock

from app.workers.execution_worker import handle_execute


@pytest.mark.asyncio
async def test_handle_execute_missing_execution_noop() -> None:
    fsm = None
    # smoke-style with minimal ctx; function constructs FSM and queries db, so mock db pool with no row
    conn = AsyncMock()
    conn.fetchrow = AsyncMock(return_value=None)
    conn.__aenter__.return_value = conn
    conn.__aexit__.return_value = None
    pool = AsyncMock()
    pool.acquire.return_value = conn

    ctx = {
        'db_pool': pool,
        'checkpoint_service': AsyncMock(),
        'logger': AsyncMock(),
    }
    await handle_execute({'executionId': 'e1', 'tenantId': 't1'}, ctx)
