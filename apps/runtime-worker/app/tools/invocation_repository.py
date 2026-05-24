from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from app.tools.runtime_context import ToolInvocationStatus, ToolRuntimeContext


class ToolInvocationRepository:
    def __init__(self) -> None:
        self._rows: dict[tuple[str, str], dict[str, Any]] = {}
        self._idempotency: set[tuple[str, str]] = set()

    async def create_invocation(self, context: ToolRuntimeContext, tool_def: Any, args_hash: str, status: ToolInvocationStatus, policy_decision: dict[str, Any]) -> None:
        key = (context.tenant_id, context.idempotency_key)
        if key in self._idempotency:
            raise ValueError("TOOL_IDEMPOTENCY_CONFLICT")
        self._idempotency.add(key)
        self._rows[(context.tenant_id, context.tool_invocation_id)] = {
            "id": context.tool_invocation_id,
            "tenant_id": context.tenant_id,
            "execution_id": context.execution_id,
            "agent_id": context.agent_id,
            "step_id": context.step_id,
            "step_index": context.step_index,
            "tool_name": tool_def.name,
            "tool_kind": tool_def.kind.value,
            "status": status.value,
            "args_hash": args_hash,
            "policy_decision_json": policy_decision,
            "side_effect_level": tool_def.side_effect_level.value,
            "idempotency_key": context.idempotency_key,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }

    async def mark_running(self, tenant_id: str, tool_invocation_id: str) -> None:
        self._rows[(tenant_id, tool_invocation_id)]["status"] = ToolInvocationStatus.RUNNING.value

    async def finalize_invocation(self, tenant_id: str, tool_invocation_id: str, status: ToolInvocationStatus, result_json: dict | None, error_code: str | None, error_message: str | None, stdout_summary: str | None, stderr_summary: str | None, duration_ms: int) -> None:
        row = self._rows[(tenant_id, tool_invocation_id)]
        row.update({"status": status.value, "result_json": result_json, "error_code": error_code, "error_message": error_message, "stdout_summary": stdout_summary, "stderr_summary": stderr_summary, "duration_ms": duration_ms, "completed_at": datetime.now(timezone.utc).isoformat()})

    async def get_invocation(self, tenant_id: str, tool_invocation_id: str) -> dict[str, Any] | None:
        return self._rows.get((tenant_id, tool_invocation_id))
