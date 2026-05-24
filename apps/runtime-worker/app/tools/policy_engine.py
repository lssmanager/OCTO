from __future__ import annotations

from app.tools.models import AgentPolicy, PolicyDecision, PolicyOutcome, SideEffectLevel, ToolDefinition, ToolStatus


class PolicyEngine:
    def validate_tool_call(self, tool: ToolDefinition, agent_policy: AgentPolicy, tenant_id: str, execution_id: str, agent_id: str, effective_tool_names: list[str]) -> PolicyDecision:
        _ = (execution_id, agent_id)
        if tool.name not in effective_tool_names:
            return PolicyDecision(outcome=PolicyOutcome.DENIED, code="TOOL_NOT_ALLOWED", reason="tool not in effective context")
        if agent_policy.tool_policy.allow and tool.name not in agent_policy.tool_policy.allow:
            return PolicyDecision(outcome=PolicyOutcome.DENIED, code="TOOL_NOT_ALLOWED", reason="tool outside allow list")
        if tool.name in agent_policy.tool_policy.deny:
            return PolicyDecision(outcome=PolicyOutcome.DENIED, code="TOOL_POLICY_DENIED", reason="tool denied by policy")
        if tool.status != ToolStatus.ENABLED or not tool.enabled:
            return PolicyDecision(outcome=PolicyOutcome.DENIED, code="TOOL_DISABLED", reason="tool disabled")
        if tool.tenant_scoped and not tenant_id:
            return PolicyDecision(outcome=PolicyOutcome.DENIED, code="TOOL_TENANT_DENIED", reason="tenant required")
        if tool.allowed_roles and not (set(agent_policy.roles) & set(tool.allowed_roles)):
            return PolicyDecision(outcome=PolicyOutcome.DENIED, code="TOOL_SCOPE_DENIED", reason="missing required role")
        if tool.allowed_scopes and not set(tool.allowed_scopes).issubset(set(agent_policy.scopes)):
            return PolicyDecision(outcome=PolicyOutcome.DENIED, code="TOOL_SCOPE_DENIED", reason="missing required scope")
        if tool.requires_approval or tool.side_effect_level == SideEffectLevel.HIGH or tool.name in agent_policy.tool_policy.require_approval:
            return PolicyDecision(outcome=PolicyOutcome.REQUIRES_APPROVAL, code="TOOL_APPROVAL_REQUIRED", reason="approval required", requires_approval=True)
        return PolicyDecision(outcome=PolicyOutcome.ALLOWED, reason="tool allowed")
