from __future__ import annotations

import asyncio
import json
import sys
import time

from app.tools.env import build_minimal_tool_env
from app.tools.runtime_context import ToolExecutionResult, ToolInvocationStatus, ToolRuntimeContext
from app.tools.workdir import create_tool_workdir


class BuiltinSubprocessExecutor:
    async def execute_builtin_tool(self, tool_def: object, args: dict, context: ToolRuntimeContext) -> ToolExecutionResult:
        started = time.time()
        workdir = create_tool_workdir(context)
        proc = await asyncio.create_subprocess_exec(
            sys.executable,
            "-m",
            "app.tools.builtin.runner",
            getattr(tool_def, "name"),
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            cwd=workdir,
            env=build_minimal_tool_env(context),
        )
        try:
            out, err = await asyncio.wait_for(proc.communicate(json.dumps(args).encode()), timeout=getattr(tool_def, "timeout_ms", 30_000) / 1000)
        except asyncio.TimeoutError:
            proc.kill()
            await proc.wait()
            return ToolExecutionResult(status=ToolInvocationStatus.TIMED_OUT, error_code="TOOL_TIMEOUT", error_message="Tool execution timed out.", retryable=True)

        out = out[: context.stdout_limit_bytes]
        err = err[: context.stderr_limit_bytes]
        stderr_text = err.decode(errors="replace") if err else None
        if proc.returncode != 0:
            return ToolExecutionResult(status=ToolInvocationStatus.FAILED, error_code="TOOL_SUBPROCESS_FAILED", error_message="Tool subprocess failed.", stderr=stderr_text, exit_code=proc.returncode, duration_ms=int((time.time()-started)*1000))
        try:
            payload = json.loads(out.decode() or "{}")
        except Exception:
            return ToolExecutionResult(status=ToolInvocationStatus.FAILED, error_code="TOOL_OUTPUT_INVALID", error_message="Tool output is not valid JSON.", stderr=stderr_text, duration_ms=int((time.time()-started)*1000))
        return ToolExecutionResult(status=ToolInvocationStatus.SUCCEEDED, result_json=payload, stdout=out.decode(errors="replace") if out else None, stderr=stderr_text, exit_code=proc.returncode, duration_ms=int((time.time()-started)*1000))
