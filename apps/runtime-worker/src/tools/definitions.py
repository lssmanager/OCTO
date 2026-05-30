from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

ToolKind = Literal["builtin_sync", "builtin_async", "mcp_stdio", "mcp_http"]
SideEffectLevel = Literal["none", "low", "high"]
ApprovalPolicy = Literal["never_require", "always_require", "policy_based"]


@dataclass(frozen=True)
class ToolDefinition:
    name: str
    kind: ToolKind
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    timeout_ms: int = 5000
    retryable: bool = True
    side_effect_level: SideEffectLevel = "none"
    enabled: bool = True
    approval_policy: ApprovalPolicy = "policy_based"
    requires_approval: bool = False
    tenant_scoped: bool = True
    allowed_roles: tuple[str, ...] = field(default_factory=tuple)
    allowed_scopes: tuple[str, ...] = field(default_factory=tuple)
    version: str = "1"
    source: Literal["builtin", "mcp", "custom"] = "builtin"
