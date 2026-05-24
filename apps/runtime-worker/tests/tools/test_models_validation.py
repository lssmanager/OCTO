import pytest
from pydantic import ValidationError

from app.tools.models import ToolDefinition, ToolKind


def test_timeout_and_version_bounds() -> None:
    base = {
        "name": "t",
        "kind": ToolKind.BUILTIN_SYNC,
        "description": "d",
        "input_schema": {"type": "object", "properties": {}, "additionalProperties": False},
        "output_schema": {"type": "object", "properties": {}, "additionalProperties": False},
    }
    with pytest.raises(ValidationError):
        ToolDefinition(**base, timeout_ms=0)
    with pytest.raises(ValidationError):
        ToolDefinition(**base, timeout_ms=-1)
    with pytest.raises(ValidationError):
        ToolDefinition(**base, version=0)
