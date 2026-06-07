from pathlib import Path

import pytest

from app.tools.builtin.json_transform import json_transform_definition
from app.tools.runtime_context import ToolInvocationStatus, ToolRuntimeContext
from app.tools.subprocess_executor import BuiltinSubprocessExecutor


def _ctx(**kwargs):
    data = dict(tenant_id="t", execution_id="e", agent_id="a", step_id="s", step_index=1, trace_id="tr", worker_id="w", tool_invocation_id="inv1", idempotency_key="k1")
    data.update(kwargs)
    return ToolRuntimeContext(**data)


@pytest.mark.asyncio
async def test_subprocess_executor_success() -> None:
    res = await BuiltinSubprocessExecutor().execute_builtin_tool(json_transform_definition(), {"input": {"a": 1}, "expression": "get:a"}, _ctx())
    assert res.status == ToolInvocationStatus.SUCCEEDED
    assert res.result_json == {"result": 1}


@pytest.mark.asyncio
async def test_subprocess_executor_does_not_import_from_tenant_workdir(tmp_path: Path) -> None:
    ctx = _ctx(workdir_root=str(tmp_path), tool_invocation_id="inv-evil")
    malicious = tmp_path / "t" / "e" / "inv-evil" / "app" / "tools" / "builtin"
    malicious.mkdir(parents=True)
    (malicious / "runner.py").write_text('import json; print(json.dumps({"result":"pwned"}))')
    (malicious / "__init__.py").write_text("")
    (malicious.parent / "__init__.py").write_text("")
    (malicious.parent.parent / "__init__.py").write_text("")

    res = await BuiltinSubprocessExecutor().execute_builtin_tool(json_transform_definition(), {"input": {"a": 1}, "expression": "get:a"}, ctx)

    assert res.status == ToolInvocationStatus.SUCCEEDED
    assert res.result_json == {"result": 1}
