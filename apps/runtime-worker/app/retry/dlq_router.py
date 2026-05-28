from __future__ import annotations

import logging
from typing import Any, Literal, Protocol

from app.fsm.types import TERMINAL_STATES


class _PoolLike(Protocol):
    def acquire(self) -> Any: ...


class DLQRouter:
    def __init__(self, db_pool: _PoolLike, queue=None, logger=None, metrics=None):
        self.db_pool = db_pool
        self.queue = queue
        self.logger = logger or logging.getLogger(__name__)
        self.metrics = metrics

    async def route_to_dlq(
        self,
        execution_id: str,
        tenant_id: str,
        error_code: str,
        error_message: str,
        original_job: dict,
        reason: Literal['poison', 'max_retries', 'invariant_breach', 'max_reclaims'],
        trace_id: str | None = None,
    ) -> None:
        async with self.db_pool.acquire() as conn:
            async with conn.transaction():
                row = await conn.fetchrow('SELECT id, status AS state, version FROM executions WHERE id=$1 AND tenant_id=$2', execution_id, tenant_id)
                if row is None:
                    return
                if row['state'] in TERMINAL_STATES:
                    self.logger.warning('execution_routed_to_dlq_skipped_terminal', extra={'tenant_id': tenant_id, 'execution_id': execution_id, 'state': row['state']})
                    return
                updated = await conn.fetchrow(
                    "UPDATE executions SET status='failed', state='failed', error_code=$1, error_message=$2, version=version+1, lease_owner=NULL, lease_expires_at=NULL, updated_at=now() WHERE id=$3 AND tenant_id=$4 AND version=$5 RETURNING version",
                    error_code,
                    error_message,
                    execution_id,
                    tenant_id,
                    row['version'],
                )
                if updated is None:
                    self.logger.warning('reclaim_cas_conflict', extra={'tenant_id': tenant_id, 'execution_id': execution_id})
                    return
                await conn.execute(
                    'INSERT INTO outbox_events (id,tenant_id,aggregate_type,aggregate_id,event_type,sequence,payload_json) VALUES (gen_random_uuid()::text,$1,$2,$3,$4,1,$5::jsonb)',
                    tenant_id,
                    'execution',
                    execution_id,
                    'ExecutionRoutedToDLQ',
                    {
                        'executionId': execution_id,
                        'tenantId': tenant_id,
                        'errorCode': error_code,
                        'errorMessage': error_message,
                        'reason': reason,
                        'originalJob': original_job,
                        'traceId': trace_id,
                    },
                )
        if self.metrics and hasattr(self.metrics, 'inc'):
            self.metrics.inc('octo_execution_dlq_total', {'error_code': error_code, 'reason': reason})
        self.logger.error('execution_routed_to_dlq', extra={'event': 'execution_routed_to_dlq', 'tenant_id': tenant_id, 'execution_id': execution_id, 'error_code': error_code, 'reason': reason, 'trace_id': trace_id, 'retry_count': original_job.get('attempt')})
