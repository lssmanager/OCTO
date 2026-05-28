import pytest

from app.retry.dlq_router import DLQRouter


class FakeConn:
    def __init__(self, row, cas_success=True):
        self.row = row
        self.cas_success = cas_success
        self.outbox_written = False

    async def fetchrow(self, query, *args):
        if query.startswith('SELECT id, status AS state, version FROM executions'):
            return self.row
        if query.startswith("UPDATE executions SET status='failed', state='failed'"):
            return {'version': self.row['version'] + 1} if self.cas_success else None
        return None

    async def execute(self, query, *args):
        if query.startswith('INSERT INTO outbox_events'):
            self.outbox_written = True

    def transaction(self):
        class T:
            async def __aenter__(self2): return None
            async def __aexit__(self2, *a): return False
        return T()


class FakePool:
    def __init__(self, conn): self.conn = conn
    def acquire(self):
        class A:
            def __init__(self, c): self.c=c
            async def __aenter__(self): return self.c
            async def __aexit__(self,*a): return False
        return A(self.conn)


class FakeMetrics:
    def __init__(self): self.calls=[]
    def inc(self, n, l): self.calls.append((n,l))


@pytest.mark.asyncio
async def test_route_to_dlq_updates_and_outbox() -> None:
    conn = FakeConn({'id': 'e1', 'state': 'running', 'version': 1})
    metrics = FakeMetrics()
    router = DLQRouter(FakePool(conn), metrics=metrics)
    await router.route_to_dlq('e1','t1','E','msg',{},'poison')
    assert conn.outbox_written
    assert metrics.calls


@pytest.mark.asyncio
async def test_route_to_dlq_terminal_no_mutation() -> None:
    conn = FakeConn({'id': 'e1', 'state': 'failed', 'version': 1})
    router = DLQRouter(FakePool(conn))
    await router.route_to_dlq('e1','t1','E','msg',{},'poison')
    assert not conn.outbox_written


@pytest.mark.asyncio
async def test_route_to_dlq_cas_conflict_noop() -> None:
    conn = FakeConn({'id': 'e1', 'state': 'running', 'version': 1}, cas_success=False)
    router = DLQRouter(FakePool(conn))
    await router.route_to_dlq('e1','t1','E','msg',{},'poison')
    assert not conn.outbox_written
