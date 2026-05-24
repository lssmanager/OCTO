from __future__ import annotations

from pydantic import BaseModel


class BudgetApprovalRequest(BaseModel):
    tenant_id: str
    execution_id: str
    agent_id: str
    step_index: int
    reason: str
