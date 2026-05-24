from app.tools import build_default_tool_registry
from app.tools.models import SideEffectLevel, ToolKind


def test_builtin_definitions() -> None:
    r = build_default_tool_registry()
    assert r.resolve("http_request").side_effect_level == SideEffectLevel.LOW
    assert r.resolve("json_transform").side_effect_level == SideEffectLevel.NONE
    assert r.resolve("wait_for_event").kind == ToolKind.BUILTIN_ASYNC
    assert len(r.to_llm_format(r.list_for_agent(["http_request", "json_transform", "wait_for_event"]))) == 3
