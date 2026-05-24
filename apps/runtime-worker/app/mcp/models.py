from __future__ import annotations
from enum import Enum
from typing import Any, Literal
from pydantic import BaseModel, Field

class MCPServerStatus(str, Enum):
    DISCOVERED = "DISCOVERED"; PENDING_REVIEW = "PENDING_REVIEW"; APPROVED = "APPROVED"; ENABLED = "ENABLED"; DISABLED = "DISABLED"; REVOKED = "REVOKED"; NEEDS_REVIEW = "NEEDS_REVIEW"
class MCPTransport(str, Enum):
    STDIO = "stdio"
class MCPServerDefinition(BaseModel):
    server_id: str; slug: str; transport: MCPTransport = MCPTransport.STDIO
    command: str; args: list[str] = Field(default_factory=list); cwd: str | None = None
    env_allowlist: list[str] = Field(default_factory=list); timeout_ms: int = 30_000
    tenant_scoped: bool = True; allowed_roles: list[str] = Field(default_factory=list); allowed_scopes: list[str] = Field(default_factory=list)
    sandbox_profile: str = "mcp-stdio-default"; network_policy: Literal["none", "egress_allowlist"] = "none"; egress_allowlist: list[str] = Field(default_factory=list)
    status: MCPServerStatus = MCPServerStatus.PENDING_REVIEW; descriptor_hash: str | None = None; version: int = 1
class MCPToolDescriptor(BaseModel):
    server_id: str; server_slug: str; remote_name: str; canonical_name: str
    title: str | None = None; description: str = ""
    input_schema: dict[str, Any]; output_schema: dict[str, Any] | None = None
    annotations: dict[str, Any] = Field(default_factory=dict)
    side_effect_level: Literal["none", "low", "high"] = "low"; requires_approval: bool = True
    descriptor_hash: str; status: MCPServerStatus = MCPServerStatus.PENDING_REVIEW
