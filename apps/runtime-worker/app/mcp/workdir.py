from __future__ import annotations
from pathlib import Path

def create_mcp_workdir(root: str, tenant_id: str, server_id: str) -> str:
    safe = lambda s: ''.join(ch for ch in s if ch.isalnum() or ch in {'-','_'})
    p = Path(root).resolve() / safe(tenant_id) / safe(server_id)
    p.mkdir(parents=True, exist_ok=True)
    return str(p)
