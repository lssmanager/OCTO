from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any

from app.tools.runtime_context import ToolExecutionResult, ToolInvocationStatus, ToolRuntimeContext


class AsyncToolCoordinator:
    def __init__(self, invocation_repository: Any, checkpoint_service: Any = None, outbox_publisher: Any = None, ttl_ms: int = 900000) -> None:
        self.repo = invocation_repository
        self.checkpoint_service = checkpoint_service
        self.outbox_publisher = outbox_publisher
        self.ttl_ms = ttl_ms

    async def start_async_invocation(self, tool_def: Any, args: dict, context: ToolRuntimeContext) -> ToolExecutionResult:
        _ = args
        await self.repo.create_invocation(context, tool_def, args_hash="async", status=ToolInvocationStatus.PENDING_ASYNC, policy_decision={"outcome": "ALLOWED"})
        row = await self.repo.get_invocation(context.tenant_id, context.tool_invocation_id)
        row["expires_at"] = (datetime.now(timezone.utc) + timedelta(milliseconds=self.ttl_ms)).isoformat()
        return ToolExecutionResult(status=ToolInvocationStatus.PENDING_ASYNC, result_json={"event_received": False, "payload": None}, error_code="TOOL_ASYNC_PENDING")

    async def complete_async_invocation(self, tenant_id: str, tool_invocation_id: str, result_json: dict, idempotency_key: str) -> ToolExecutionResult:
        row = await self.repo.get_invocation(tenant_id, tool_invocation_id)
        if row is None:
            return ToolExecutionResult(status=ToolInvocationStatus.FAILED, error_code="TOOL_NOT_ALLOWED", error_message="invocation not found")
        if row.get("idempotency_key") != idempotency_key:
            return ToolExecutionResult(status=ToolInvocationStatus.FAILED, error_code="TOOL_IDEMPOTENCY_CONFLICT", error_message="idempotency key mismatch")
        if row.get("status") == ToolInvocationStatus.SUCCEEDED.value:
            return ToolExecutionResult(status=ToolInvocationStatus.SUCCEEDED, result_json=row.get("result_json"), output_schema_valid=True)
        await self.repo.finalize_invocation(tenant_id, tool_invocation_id, ToolInvocationStatus.SUCCEEDED, result_json, None, None, None, None, 0)
        if self.checkpoint_service is not None:
            await self.checkpoint_service.append_write({"type": "tool_result", "tool_invocation_id": tool_invocation_id, "status": "SUCCEEDED", "result_json": result_json})
        if self.outbox_publisher is not None:
            await self.outbox_publisher.publish({"type": "tool.async.result", "tool_invocation_id": tool_invocation_id})
        return ToolExecutionResult(status=ToolInvocationStatus.SUCCEEDED, result_json=result_json, output_schema_valid=True)
