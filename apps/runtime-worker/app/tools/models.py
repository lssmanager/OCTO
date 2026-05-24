from __future__ import annotations

from enum import Enum
from typing import Any, Literal

from pydantic import BaseModel, Field


class ToolKind(str, Enum):
    BUILTIN_SYNC = "builtin_sync"
    BUILTIN_ASYNC = "builtin_async"
    MCP_STDIO = "mcp_stdio"
    MCP_HTTP = "mcp_http"


class SideEffectLevel(str, Enum):
    NONE = "none"
    LOW = "low"
    HIGH = "high"


class ToolStatus(str, Enum):
    DISCOVERED = "DISCOVERED"
    PENDING_REVIEW = "PENDING_REVIEW"
    APPROVED = "APPROVED"
    ENABLED = "ENABLED"
    DISABLED = "DISABLED"
    DEPRECATED = "DEPRECATED"
    REVOKED = "REVOKED"
    NEEDS_REVIEW = "NEEDS_REVIEW"


class ApprovalPolicy(str, Enum):
    NEVER_REQUIRE = "never_require"
    ALWAYS_REQUIRE = "always_require"
    POLICY_BASED = "policy_based"


class ToolDefinition(BaseModel):
    name: str = Field(min_length=1)
    kind: ToolKind
    description: str = Field(min_length=1)
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    timeout_ms: int = 30_000
    retryable: bool = False
    side_effect_level: SideEffectLevel = SideEffectLevel.NONE
    approval_policy: ApprovalPolicy = ApprovalPolicy.POLICY_BASED
    requires_approval: bool = False
    tenant_scoped: bool = True
    allowed_roles: list[str] = Field(default_factory=list)
    allowed_scopes: list[str] = Field(default_factory=list)
    sandbox_profile: str = "builtin-default"
    network_policy: Literal["none", "egress_allowlist", "mcp_http_only"] = "none"
    egress_allowlist: list[str] = Field(default_factory=list)
    compensation_action: str | None = None
    non_compensatable: bool = False
    source: Literal["builtin", "mcp", "hub", "custom"] = "builtin"
    source_ref: str | None = None
    descriptor_hash: str | None = None
    version: int = 1
    status: ToolStatus = ToolStatus.ENABLED
    enabled: bool = True


class AgentToolPolicy(BaseModel):
    allow: list[str] = Field(default_factory=list)
    deny: list[str] = Field(default_factory=list)
    require_approval: list[str] = Field(default_factory=list)


class AgentPolicy(BaseModel):
    tool_policy: AgentToolPolicy = Field(default_factory=AgentToolPolicy)
    roles: list[str] = Field(default_factory=list)
    scopes: list[str] = Field(default_factory=list)


class PolicyOutcome(str, Enum):
    ALLOWED = "ALLOWED"
    REQUIRES_APPROVAL = "REQUIRES_APPROVAL"
    DENIED = "DENIED"


class PolicyDecision(BaseModel):
    outcome: PolicyOutcome
    code: str | None = None
    reason: str
    requires_approval: bool = False


class EffectiveToolContext(BaseModel):
    tenant_id: str = ""
    execution_id: str = ""
    agent_id: str = ""
    hierarchy_path: list[str] = Field(default_factory=list)
    effective_tool_names: list[str] = Field(default_factory=list)
    disabled_by_override: list[str] = Field(default_factory=list)
    needs_review: list[str] = Field(default_factory=list)
