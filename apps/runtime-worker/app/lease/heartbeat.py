import asyncio
from datetime import timedelta
from .errors import LeaseRevokedError

class HeartbeatEmitter:
    interval_seconds = 10
    lease_duration_seconds = 30
    def __init__(self, db, execution_id: str, tenant_id: str, worker_id: str):
        self.db=db; self.execution_id=execution_id; self.tenant_id=tenant_id; self.worker_id=worker_id; self._task=None; self._stop=False
    async def renew_once(self):
        result = await self.db.execute("UPDATE executions SET lease_expires_at=now()+interval '30 seconds', heartbeat_at=now() WHERE id=$1 AND tenant_id=$2 AND lease_owner=$3 AND state='RUNNING'", self.execution_id, self.tenant_id, self.worker_id)
        if str(result).endswith('0'): raise LeaseRevokedError()
    async def _loop(self):
        while not self._stop:
            await self.renew_once(); await asyncio.sleep(self.interval_seconds)
    def start(self): self._task = asyncio.create_task(self._loop())
    async def stop(self): self._stop=True; await self._task if self._task else None
