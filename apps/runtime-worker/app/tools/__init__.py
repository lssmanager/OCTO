from app.tools.builtin import http_request_definition, json_transform_definition, wait_for_event_definition
from app.tools.registry import ToolRegistry


def build_default_tool_registry() -> ToolRegistry:
    registry = ToolRegistry()
    registry.register(http_request_definition())
    registry.register(json_transform_definition())
    registry.register(wait_for_event_definition())
    return registry
