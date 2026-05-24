import pytest

from app.tools.builtin.http_request import http_request_definition
from app.tools.effective_tools import EffectiveToolsResolver, HierarchyToolLevel
from app.tools.errors import ToolContextValidationError
from app.tools.registry import ToolRegistry


def test_effective_tools_resolver() -> None:
    r = ToolRegistry(); t = http_request_definition(); r.register(t)
    levels = [
        HierarchyToolLevel(level_id="agent", level_type="agent", level_name="a", status="ACTIVE", tools_md_content="Assigned Tools\nhttp_request"),
        HierarchyToolLevel(level_id="agency", level_type="agency", level_name="g", status="ACTIVE", tools_md_content="Assigned Tools\nother_tool"),
    ]
    with pytest.raises(ToolContextValidationError):
        EffectiveToolsResolver().resolve(levels, r, strict=True)
    ctx = EffectiveToolsResolver().resolve(levels, r, strict=False)
    assert "http_request" in ctx.effective_tool_names
