import logging
from typing import Any, Protocol
from uuid import uuid4


class _PoolLike(Protocol):
    def acquire(self) -> Any: ...


from .errors import InvalidTransitionError
from .types import CASResult, ExecutionContext, TERMINAL_STATES, VALID_TRANSITIONS


class ExecutionFSM:
    def __init__(self, db_pool: _PoolLike, logger: logging.Logger | None = None) -> None:
        self._db_pool = db_pool
        self._logger = logger or logging.getLogger(__name__)

    @staticmethod
    def _validate_transition(expected_state: str, next_state: str) -> None:
        allowed = VALID_TRANSITIONS.get(expected_state)
        if allowed is None:
            raise InvalidTransitionError(f"unknown expected state: {expected_state}")
        if expected_state in TERMINAL_STATES:
            raise InvalidTransitionError(f"terminal state has no outgoing transitions: {expected_state}")
        if next_state not in allowed:
            raise InvalidTransitionError(f"invalid transition {expected_state} -> {next_state}")

    async def load_context(self, execution_id: str, tenant_id: str) -> ExecutionContext | None:
        query = """
        SELECT
          id,
          tenant_id,
          agent_id,
          agent_version_id,
          state,
          version,
          attempt_count,
          reclaim_count,
          lease_owner,
          lease_expires_at,
          cancellation_requested_at,
          budget_snapshot_json,
          context_snapshot_json,
          created_by,
          created_at,
          updated_at
        FROM executions
        WHERE id = $1 AND tenant_id = $2
        """
        async with self._db_pool.acquire() as conn:
            row = await conn.fetchrow(query, execution_id, tenant_id)
        if row is None:
            return None
        return ExecutionContext(
            execution_id=row["id"],
            tenant_id=row["tenant_id"],
            agent_id=row["agent_id"],
            agent_version_id=row["agent_version_id"],
            state=row["state"],
            version=row["version"],
            attempt_count=row["attempt_count"],
            reclaim_count=row["reclaim_count"],
            lease_owner=row["lease_owner"],
            lease_expires_at=row["lease_expires_at"],
            cancellation_requested_at=row["cancellation_requested_at"],
            budget_snapshot=row["budget_snapshot_json"] or {},
            context_snapshot=row["context_snapshot_json"] or {},
            created_by=row["created_by"],
            created_at=row["created_at"],
            updated_at=row["updated_at"],
        )

    async def transition(
        self,
        execution_id: str,
        tenant_id: str,
        expected_state: str,
        next_state: str,
        expected_version: int,
        lease_owner: str | None = None,
        lease_duration_seconds: int = 30,
        metadata: dict[str, object] | None = None,
        step_type: str | None = None,
    ) -> CASResult:
        self._validate_transition(expected_state, next_state)
        step_type_value = step_type or "checkpoint"
        step_status_value = "SUCCEEDED"
        step_payload = metadata or {}

        async with self._db_pool.acquire() as conn:
            async with conn.transaction():
                current = await conn.fetchrow(
                    "SELECT lease_owner FROM executions WHERE id=$1 AND tenant_id=$2 AND state=$3",
                    execution_id,
                    tenant_id,
                    expected_state,
                )

                if expected_state == "RUNNING" and next_state != "RECLAIMING" and current is not None:
                    current_owner = current["lease_owner"]
                    if current_owner is not None and lease_owner is not None and current_owner != lease_owner:
                        return CASResult(
                            success=False,
                            conflict=True,
                            new_version=None,
                            previous_state=expected_state,
                            next_state=next_state,
                            execution_id=execution_id,
                        )

                lease_expires_at_expr = "NULL"
                lease_expires_at_arg = None
                if lease_owner is not None:
                    lease_expires_at_expr = "$5::timestamptz"
                    lease_expires_at_arg = "now()"  # replaced below with SQL expression in query

                update_query = f"""
                UPDATE executions
                SET state = $1,
                    version = version + 1,
                    updated_at = now(),
                    lease_owner = $4,
                    lease_expires_at = {'now() + ($8::int * interval \'1 second\')' if lease_owner is not None else 'lease_expires_at'}
                WHERE id = $2
                  AND tenant_id = $3
                  AND state = $6
                  AND version = $7
                RETURNING version
                """
                updated = await conn.fetchrow(
                    update_query,
                    next_state,
                    execution_id,
                    tenant_id,
                    lease_owner,
                    lease_expires_at_arg,
                    expected_state,
                    expected_version,
                    lease_duration_seconds,
                )

                if updated is None:
                    self._logger.warning(
                        "execution_fsm_cas_conflict",
                        extra={
                            "event": "execution_fsm_cas_conflict",
                            "execution_id": execution_id,
                            "tenant_id": tenant_id,
                            "expected_state": expected_state,
                            "next_state": next_state,
                            "expected_version": expected_version,
                            "cas_conflict": True,
                        },
                    )
                    return CASResult(
                        success=False,
                        conflict=True,
                        new_version=None,
                        previous_state=expected_state,
                        next_state=next_state,
                        execution_id=execution_id,
                    )

                step_index_row = await conn.fetchrow(
                    "SELECT COALESCE(MAX(step_index), -1) + 1 AS next_step_index FROM execution_steps WHERE tenant_id = $1 AND execution_id = $2",
                    tenant_id,
                    execution_id,
                )
                await conn.execute(
                    """
                    INSERT INTO execution_steps (
                      id, tenant_id, execution_id, step_index, step_type,
                      state_from, state_to, status, input_json, output_json,
                      error_code, error_message, started_at, ended_at
                    ) VALUES (
                      $1, $2, $3, $4, $5,
                      $6, $7, $8, $9::jsonb, $10::jsonb,
                      NULL, NULL, now(), now()
                    )
                    """,
                    str(uuid4()),
                    tenant_id,
                    execution_id,
                    step_index_row["next_step_index"],
                    step_type_value,
                    expected_state,
                    next_state,
                    step_status_value,
                    step_payload,
                    {},
                )

                return CASResult(
                    success=True,
                    conflict=False,
                    new_version=updated["version"],
                    previous_state=expected_state,
                    next_state=next_state,
                    execution_id=execution_id,
                )
