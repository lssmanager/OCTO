from __future__ import annotations

import asyncio
import logging
from datetime import UTC, datetime, timedelta
from typing import Any, Protocol

from .errors import LeaseRenewalError, LeaseRevokedError


class _PoolLike(Protocol):
    def acquire(self) -> Any: ...


class HeartbeatEmitter:
    def __init__(
        self,
        db_pool: _PoolLike,
        execution_id: str,
        tenant_id: str,
        lease_owner: str,
        logger: logging.Logger | None = None,
        heartbeat_interval_seconds: int = 10,
        lease_duration_seconds: int = 30,
    ):
        self._db_pool = db_pool
        self.execution_id = execution_id
        self.tenant_id = tenant_id
        self.lease_owner = lease_owner
        self._logger = logger or logging.getLogger(__name__)
        self._heartbeat_interval_seconds = heartbeat_interval_seconds
        self._lease_duration_seconds = lease_duration_seconds
        self._stop_event = asyncio.Event()
        self._task: asyncio.Task[None] | None = None
        self.revoked = False

    async def renew_once(self) -> None:
        expires_at = datetime.now(UTC) + timedelta(seconds=self._lease_duration_seconds)
        query = (
            "UPDATE executions "
            "SET lease_expires_at = $1, updated_at = now() "
            "WHERE id = $2 AND tenant_id = $3 AND lease_owner = $4 AND status = 'running' "
            "RETURNING id"
        )
        try:
            async with self._db_pool.acquire() as conn:
                row = await conn.fetchrow(
                    query,
                    expires_at,
                    self.execution_id,
                    self.tenant_id,
                    self.lease_owner,
                )
        except LeaseRevokedError:
            raise
        except Exception as exc:
            self._logger.warning(
                "heartbeat_failed",
                extra={"event": "heartbeat_failed", "execution_id": self.execution_id, "tenant_id": self.tenant_id, "lease_owner": self.lease_owner, "error_class": exc.__class__.__name__},
            )
            raise LeaseRenewalError(str(exc)) from exc

        if row is None:
            self.revoked = True
            raise LeaseRevokedError(
                f"Lease revoked for execution {self.execution_id}, worker {self.lease_owner} should abort"
            )

        self._logger.info(
            "heartbeat_renewed",
            extra={"event": "heartbeat_renewed", "execution_id": self.execution_id, "tenant_id": self.tenant_id, "lease_owner": self.lease_owner},
        )

    async def _run_loop(self) -> None:
        while not self._stop_event.is_set():
            try:
                await self.renew_once()
            except LeaseRevokedError:
                self.revoked = True
                self._logger.warning(
                    "lease_revoked",
                    extra={"event": "lease_revoked", "execution_id": self.execution_id, "tenant_id": self.tenant_id, "lease_owner": self.lease_owner},
                )
                self._stop_event.set()
                return
            except LeaseRenewalError:
                pass

            try:
                await asyncio.wait_for(self._stop_event.wait(), timeout=self._heartbeat_interval_seconds)
            except TimeoutError:
                continue

    async def start(self) -> None:
        if self._task is None or self._task.done():
            self._stop_event.clear()
            self._task = asyncio.create_task(self._run_loop())

    async def stop(self) -> None:
        self._stop_event.set()
        if self._task is not None:
            await self._task
            self._task = None
