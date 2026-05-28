"""Persistent runtime-worker heartbeat for F1 operational status."""
from __future__ import annotations

import asyncio
import datetime as dt
import json
import os
from typing import Any

import structlog

log = structlog.get_logger(__name__)
_task: asyncio.Task[None] | None = None


def _utc_now() -> dt.datetime:
    return dt.datetime.now(tz=dt.UTC)


async def _write_heartbeat(started_at: dt.datetime, instance_id: str) -> None:
    import asyncpg  # type: ignore[import-untyped]

    db_url = os.environ.get("DATABASE_URL", "")
    if not db_url:
        raise RuntimeError("DATABASE_URL not configured")

    conn = await asyncpg.connect(db_url, timeout=3)
    try:
        await conn.execute(
            """
            INSERT INTO worker_heartbeats (
              id,
              worker_type,
              instance_id,
              status,
              started_at,
              last_heartbeat_at,
              version,
              commit_sha,
              metadata,
              error,
              updated_at
            ) VALUES ($1, 'runtime-worker', $2, 'ok', $3, now(), $4, $5, $6::jsonb, NULL, now())
            ON CONFLICT (worker_type, instance_id)
            DO UPDATE SET
              status = EXCLUDED.status,
              last_heartbeat_at = now(),
              version = EXCLUDED.version,
              commit_sha = EXCLUDED.commit_sha,
              metadata = EXCLUDED.metadata,
              error = NULL,
              updated_at = now()
            """,
            f"runtime-worker:{instance_id}",
            instance_id,
            started_at,
            os.environ.get("BUILD_VERSION"),
            os.environ.get("BUILD_COMMIT"),
            json.dumps({"pid": os.getpid(), "service": os.environ.get("OTEL_SERVICE_NAME", "octo-runtime-worker")}),
        )
    finally:
        await conn.close()


async def _heartbeat_loop(started_at: dt.datetime, instance_id: str, interval_seconds: float) -> None:
    while True:
        try:
            await _write_heartbeat(started_at, instance_id)
        except asyncio.CancelledError:
            raise
        except Exception as exc:  # noqa: BLE001
            log.warning("runtime_worker_heartbeat_failed", error=str(exc), instance_id=instance_id)
        await asyncio.sleep(interval_seconds)


def start_worker_heartbeat() -> None:
    """Start background heartbeat; failures are logged and do not fail readiness."""
    global _task
    if _task is not None and not _task.done():
        return
    interval_ms = float(os.environ.get("WORKER_HEARTBEAT_INTERVAL_MS", "30000"))
    interval_seconds = max(interval_ms / 1000.0, 1.0)
    instance_id = os.environ.get("WORKER_INSTANCE_ID") or os.environ.get("WORKER_ID") or f"runtime-{os.getpid()}"
    _task = asyncio.create_task(_heartbeat_loop(_utc_now(), instance_id, interval_seconds))


async def stop_worker_heartbeat() -> None:
    """Stop background heartbeat on graceful shutdown."""
    global _task
    if _task is None:
        return
    _task.cancel()
    try:
        await _task
    except asyncio.CancelledError:
        pass
    _task = None
