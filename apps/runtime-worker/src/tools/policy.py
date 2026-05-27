from __future__ import annotations

def authorize_tool(defn, tenant_id: str) -> tuple[str,str|None]:
    if not defn or not defn.enabled:
        return 'deny', 'TOOL_NOT_ALLOWED'
    if not tenant_id:
        return 'deny', 'TOOL_SCOPE_DENIED'
    if defn.side_effect_level == 'high':
        return 'approval_required', 'TOOL_APPROVAL_REQUIRED'
    return 'allow', None
