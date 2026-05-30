from __future__ import annotations

from collections.abc import Mapping
from dataclasses import dataclass
from typing import Any, Literal

from .definitions import ToolDefinition

PolicyOutcome = Literal["allow", "deny", "approval_required"]


@dataclass(frozen=True)
class ToolPolicyDecision:
    outcome: PolicyOutcome
    code: str | None = None
    reason: str = ""
    requires_approval: bool = False
    snapshot: dict[str, Any] | None = None


def authorize_tool(
    defn: ToolDefinition | None,
    tenant_id: str,
    *,
    agent_id: str | None = None,
    tool_name: str | None = None,
    effective_tool_names: set[str] | None = None,
    snapshot: Mapping[str, Any] | None = None,
) -> ToolPolicyDecision:
    name = tool_name or (defn.name if defn else "")
    policy_snapshot = _policy_snapshot(snapshot, effective_tool_names)
    if not defn or not defn.enabled:
        return ToolPolicyDecision(
            "deny",
            "TOOL_NOT_ALLOWED",
            "tool is not registered or enabled",
            snapshot=policy_snapshot,
        )
    if not tenant_id:
        return ToolPolicyDecision("deny", "TOOL_SCOPE_DENIED", "tenant_id is required", snapshot=policy_snapshot)
    if effective_tool_names is None or name not in effective_tool_names:
        return ToolPolicyDecision(
            "deny",
            "TOOL_NOT_ALLOWED",
            "tool is not in the effective allowlist",
            snapshot=policy_snapshot,
        )

    agent_policy = _get_mapping(snapshot, "tool_policy", "toolPolicy")
    deny = set(_string_list(agent_policy.get("deny"))) if agent_policy else set()
    allow = set(_string_list(agent_policy.get("allow"))) if agent_policy else set()
    require_approval = (
        set(_string_list(agent_policy.get("require_approval"), agent_policy.get("requireApproval")))
        if agent_policy
        else set()
    )
    roles = set(_string_list(snapshot.get("roles"))) if isinstance(snapshot, Mapping) else set()
    scopes = set(_string_list(snapshot.get("scopes"))) if isinstance(snapshot, Mapping) else set()

    if name in deny:
        return ToolPolicyDecision(
            "deny",
            "TOOL_POLICY_DENIED",
            "tool denied by agent policy",
            snapshot=policy_snapshot,
        )
    if allow and name not in allow:
        return ToolPolicyDecision(
            "deny",
            "TOOL_NOT_ALLOWED",
            "tool outside agent policy allowlist",
            snapshot=policy_snapshot,
        )
    if defn.allowed_roles and not (roles & set(defn.allowed_roles)):
        return ToolPolicyDecision("deny", "TOOL_SCOPE_DENIED", "missing required role", snapshot=policy_snapshot)
    if defn.allowed_scopes and not set(defn.allowed_scopes).issubset(scopes):
        return ToolPolicyDecision("deny", "TOOL_SCOPE_DENIED", "missing required scope", snapshot=policy_snapshot)
    if (
        defn.requires_approval
        or defn.approval_policy == "always_require"
        or defn.side_effect_level == "high"
        or name in require_approval
    ):
        return ToolPolicyDecision(
            "approval_required",
            "TOOL_APPROVAL_REQUIRED",
            "tool requires human approval",
            True,
            policy_snapshot,
        )
    return ToolPolicyDecision(
        "allow",
        reason=f"tool allowed for agent {agent_id or 'unknown'}",
        snapshot=policy_snapshot,
    )


def _policy_snapshot(snapshot: Mapping[str, Any] | None, effective_tool_names: set[str] | None) -> dict[str, Any]:
    return {
        "effective_tool_names": sorted(effective_tool_names or []),
        "tool_policy": dict(_get_mapping(snapshot, "tool_policy", "toolPolicy") or {}),
    }


def _get_mapping(source: Mapping[str, Any] | None, *keys: str) -> Mapping[str, Any] | None:
    if not isinstance(source, Mapping):
        return None
    for key in keys:
        value = source.get(key)
        if isinstance(value, Mapping):
            return value
    return None


def _string_list(*values: Any) -> list[str]:
    for value in values:
        if isinstance(value, list):
            return [item for item in value if isinstance(item, str)]
    return []
