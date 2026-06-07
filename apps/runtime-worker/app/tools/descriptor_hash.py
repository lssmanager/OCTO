from __future__ import annotations

import hashlib
import json

from app.tools.models import ToolDefinition


def compute_descriptor_hash(tool: ToolDefinition) -> str:
    payload = {
        "name": tool.name,
        "kind": tool.kind.value,
        "description": tool.description,
        "input_schema": tool.input_schema,
        "output_schema": tool.output_schema,
        "timeout_ms": tool.timeout_ms,
        "retryable": tool.retryable,
        "side_effect_level": tool.side_effect_level.value,
        "approval_policy": tool.approval_policy.value,
        "requires_approval": tool.requires_approval,
        "tenant_scoped": tool.tenant_scoped,
        "allowed_roles": sorted(tool.allowed_roles),
        "allowed_scopes": sorted(tool.allowed_scopes),
        "sandbox_profile": tool.sandbox_profile,
        "network_policy": tool.network_policy,
        "egress_allowlist": sorted(tool.egress_allowlist),
        "compensation_action": tool.compensation_action,
        "non_compensatable": tool.non_compensatable,
        "source": tool.source,
        "source_ref": tool.source_ref,
        "version": tool.version,
        "status": tool.status.value,
        "enabled": tool.enabled,
    }
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return f"sha256:{hashlib.sha256(canonical.encode('utf-8')).hexdigest()}"
