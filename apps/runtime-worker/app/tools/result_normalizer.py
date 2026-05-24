from __future__ import annotations

from app.tools.runtime_context import ToolExecutionResult, ToolInvocationStatus


def tool_failure(tool_name: str, code: str, message: str, retryable: bool = False) -> ToolExecutionResult:
    _ = tool_name
    return ToolExecutionResult(status=ToolInvocationStatus.FAILED, error_code=code, error_message=message, retryable=retryable)
