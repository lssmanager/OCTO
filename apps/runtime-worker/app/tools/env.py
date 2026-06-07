from __future__ import annotations

from pathlib import Path

from app.tools.runtime_context import ToolRuntimeContext


def runtime_worker_root() -> str:
    return str(Path(__file__).resolve().parents[2])


def build_minimal_tool_env(context: ToolRuntimeContext, env_allowlist: list[str] | None = None) -> dict[str, str]:
    _ = env_allowlist
    return {
        "OCTO_TENANT_ID": context.tenant_id,
        "OCTO_EXECUTION_ID": context.execution_id,
        "OCTO_AGENT_ID": context.agent_id,
        "OCTO_TRACE_ID": context.trace_id,
        "OCTO_TOOL_INVOCATION_ID": context.tool_invocation_id,
        "PYTHONPATH": runtime_worker_root(),
        "PYTHONSAFEPATH": "1",
        "PYTHONNOUSERSITE": "1",
    }
