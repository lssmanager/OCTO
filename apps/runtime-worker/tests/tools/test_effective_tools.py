import pytest

from app.tools.builtin.http_request import http_request_definition
from app.tools.effective_tools import EffectiveToolsResolver, HierarchyToolLevel
from app.tools.errors import ToolContextValidationError
from app.tools.models import ToolStatus
from app.tools.registry import ToolRegistry


def test_effective_tools_resolver() -> None:
    r = ToolRegistry()
    t = http_request_definition()
    r.register(t)
    levels = [
        HierarchyToolLevel(level_id="agent", level_type="agent", level_name="a", status="ACTIVE", tools_md_content="Assigned Tools\nhttp_request"),
        HierarchyToolLevel(level_id="agency", level_type="agency", level_name="g", status="ACTIVE", tools_md_content="Assigned Tools\nother_tool"),
    ]
    with pytest.raises(ToolContextValidationError):
        EffectiveToolsResolver().resolve(levels, r, strict=True)
    ctx = EffectiveToolsResolver().resolve(levels, r, strict=False)
    assert "http_request" in ctx.effective_tool_names


def test_collects_needs_review_without_early_abort() -> None:
    r = ToolRegistry()
    t = http_request_definition()
    t.name = "review_one"
    t.status = ToolStatus.NEEDS_REVIEW
    r.register(t)
    t2 = http_request_definition()
    t2.name = "review_two"
    t2.status = ToolStatus.NEEDS_REVIEW
    r.register(t2)
    levels = [HierarchyToolLevel(level_id="agent", level_type="agent", level_name="a", status="ACTIVE", tools_md_content="## Assigned Tools\n- review_one\n- review_two")]
    ctx = EffectiveToolsResolver().resolve(levels, r, strict=True)
    assert sorted(ctx.needs_review) == ["review_one", "review_two"]
