from __future__ import annotations

import os
from pathlib import Path

from app.tools.runtime_context import ToolRuntimeContext


def _safe(part: str) -> str:
    return "".join(ch for ch in part if ch.isalnum() or ch in {"-", "_"})


def create_tool_workdir(context: ToolRuntimeContext) -> str:
    base = Path(context.workdir_root).resolve()
    folder = base / _safe(context.tenant_id) / _safe(context.execution_id) / _safe(context.tool_invocation_id)
    folder.mkdir(parents=True, exist_ok=True)
    os.chmod(folder, 0o700)
    return str(folder)
