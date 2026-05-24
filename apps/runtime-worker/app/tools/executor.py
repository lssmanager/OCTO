from __future__ import annotations

import hashlib
import json
from typing import Any

from app.tools.models import PolicyOutcome, SideEffectLevel, ToolKind
from app.tools.result_normalizer import tool_failure
from app.tools.runtime_context import ToolExecutionRequest, ToolExecutionResult, ToolInvocationStatus, ToolRuntimeContext


class ToolExecutor:
    def __init__(self, registry: Any, policy_engine: Any, schema_validator: Any, subprocess_executor: Any, async_coordinator: Any, invocation_repository: Any, audit_service: Any, checkpoint_service: Any, outbox_publisher: Any, logger: Any, metrics: Any) -> None:
        self.registry = registry
        self.policy_engine = policy_engine
        self.schema_validator = schema_validator
        self.subprocess_executor = subprocess_executor
        self.async_coordinator = async_coordinator
        self.repo = invocation_repository
        self.audit = audit_service
        self.checkpoint_service = checkpoint_service
        self.outbox = outbox_publisher
        self.logger = logger
        self.metrics = metrics

    async def execute(self, request: ToolExecutionRequest, context: ToolRuntimeContext, agent_policy: Any, effective_tool_names: list[str]) -> ToolExecutionResult:
        try:
            tool = self.registry.resolve(request.tool_name)
        except Exception:
            return tool_failure(request.tool_name, "TOOL_NOT_ALLOWED", "The requested tool is not authorized for this agent.")
        try:
            self.schema_validator.validate_input(tool, request.arguments_json)
        except Exception:
            await self.repo.create_invocation(context, tool, "invalid", ToolInvocationStatus.FAILED, {"outcome": "DENIED"})
            await self.repo.finalize_invocation(context.tenant_id, context.tool_invocation_id, ToolInvocationStatus.FAILED, None, "TOOL_INPUT_INVALID", "Tool input validation failed.", None, None, 0)
            return tool_failure(request.tool_name, "TOOL_INPUT_INVALID", "Tool input validation failed.")
        policy = self.policy_engine.validate_tool_call(tool, agent_policy, context.tenant_id, context.execution_id, context.agent_id, effective_tool_names)
        args_hash = hashlib.sha256(json.dumps(request.arguments_json, sort_keys=True).encode()).hexdigest()
        if policy.outcome == PolicyOutcome.DENIED:
            await self.repo.create_invocation(context, tool, args_hash, ToolInvocationStatus.FAILED, policy.model_dump())
            await self.repo.finalize_invocation(context.tenant_id, context.tool_invocation_id, ToolInvocationStatus.FAILED, None, policy.code or "TOOL_NOT_ALLOWED", policy.reason, None, None, 0)
            return tool_failure(request.tool_name, policy.code or "TOOL_NOT_ALLOWED", "The requested tool is not authorized for this agent.")
        if policy.outcome == PolicyOutcome.REQUIRES_APPROVAL:
            await self.repo.create_invocation(context, tool, args_hash, ToolInvocationStatus.APPROVAL_REQUIRED, policy.model_dump())
            return ToolExecutionResult(status=ToolInvocationStatus.APPROVAL_REQUIRED, error_code="TOOL_APPROVAL_REQUIRED", error_message="Tool call requires approval.")

        if context.replay_mode and tool.side_effect_level in {SideEffectLevel.LOW, SideEffectLevel.HIGH}:
            prev = await self.repo.get_invocation(context.tenant_id, context.tool_invocation_id)
            if prev and prev.get("result_json"):
                return ToolExecutionResult(status=ToolInvocationStatus.SUCCEEDED, result_json=prev["result_json"], output_schema_valid=True)
            return tool_failure(request.tool_name, "TOOL_REPLAY_SIDE_EFFECT_BLOCKED", "Replay blocked for side-effect tool.")

        if tool.kind == ToolKind.BUILTIN_ASYNC:
            return await self.async_coordinator.start_async_invocation(tool, request.arguments_json, context)

        await self.repo.create_invocation(context, tool, args_hash, ToolInvocationStatus.PENDING, policy.model_dump())
        await self.repo.mark_running(context.tenant_id, context.tool_invocation_id)
        result = await self.subprocess_executor.execute_builtin_tool(tool, request.arguments_json, context)
        if result.status == ToolInvocationStatus.SUCCEEDED and result.result_json is not None:
            try:
                self.schema_validator.validate_output(tool, result.result_json)
                result.output_schema_valid = True
            except Exception:
                result = tool_failure(request.tool_name, "TOOL_OUTPUT_INVALID", "Tool output failed schema validation.")

        await self.repo.finalize_invocation(context.tenant_id, context.tool_invocation_id, result.status, result.result_json, result.error_code, result.error_message, (result.stdout or "")[:512] or None, (result.stderr or "")[:512] or None, result.duration_ms or 0)
        if result.status == ToolInvocationStatus.SUCCEEDED and self.checkpoint_service is not None:
            await self.checkpoint_service.append_write({"type": "tool_result", "tool_invocation_id": context.tool_invocation_id, "tool_name": request.tool_name, "status": "SUCCEEDED", "result_json": result.result_json})
        if self.outbox is not None:
            await self.outbox.publish({"type": "tool.invocation", "tool_invocation_id": context.tool_invocation_id, "status": result.status.value})
        if self.audit is not None:
            await self.audit.emit("tool.invocation_completed", {"tenant_id": context.tenant_id, "execution_id": context.execution_id, "agent_id": context.agent_id, "tool_invocation_id": context.tool_invocation_id, "tool_name": request.tool_name, "status": result.status.value, "trace_id": context.trace_id})
        return result
