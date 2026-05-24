from .errors import InvalidTransitionError
from .types import CASResult, ExecutionContext, TERMINAL_STATES, VALID_TRANSITIONS


class ExecutionFSM:
    def __init__(self, db):
        self.db = db

    async def load_context(self, execution_id: str, tenant_id: str) -> ExecutionContext | None:
        row = await self.db.fetchrow("SELECT id, tenant_id, state, version, lease_owner, lease_expires_at FROM executions WHERE id=$1 AND tenant_id=$2", execution_id, tenant_id)
        return ExecutionContext(**dict(row)) if row else None

    async def transition(self, context: ExecutionContext, to_state: str, *, worker_id: str | None = None, lease_owner: str | None = None, lease_expires_at=None) -> CASResult:
        latest = await self.load_context(context.id, context.tenant_id)
        if latest is None:
            return CASResult(success=False, conflict=True)
        if latest.state in TERMINAL_STATES and to_state not in TERMINAL_STATES:
            raise InvalidTransitionError(f"terminal state {latest.state} cannot transition to {to_state}")
        if to_state not in VALID_TRANSITIONS.get(latest.state, set()):
            raise InvalidTransitionError(f"invalid transition {latest.state}->{to_state}")
        lease_guard = ""
        args = [context.id, context.tenant_id, latest.state, latest.version]
        if worker_id:
            lease_guard = " AND lease_owner = $5"
            args.append(worker_id)
        updated = await self.db.execute(
            "UPDATE executions SET state=$6, version=version+1, lease_owner=COALESCE($7, lease_owner), lease_expires_at=COALESCE($8, lease_expires_at), updated_at=now() "
            "WHERE id=$1 AND tenant_id=$2 AND state=$3 AND version=$4" + lease_guard,
            *args,
            to_state,
            lease_owner,
            lease_expires_at,
        )
        if str(updated).endswith("0"):
            return CASResult(success=False, conflict=True)
        await self.db.execute("INSERT INTO execution_steps(id, tenant_id, execution_id, step_index, step_type, state_from, state_to, status) VALUES(gen_random_uuid()::text,$1,$2,(SELECT COALESCE(MAX(step_index),-1)+1 FROM execution_steps WHERE execution_id=$2),'checkpoint',$3,$4,'RUNNING')", context.tenant_id, context.id, latest.state, to_state)
        return CASResult(success=True, new_version=latest.version + 1)
