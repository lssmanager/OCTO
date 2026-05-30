from __future__ import annotations

from collections.abc import Callable, Mapping
from typing import Any

from .builtin import echo_tool, math_add_tool
from .definitions import ToolDefinition

ToolHandler = Callable[[dict[str, Any]], dict[str, Any]]


class ToolRegistry:
    """Runtime tool registry with a stable contract for builtin and MCP-style tools.

    The registry owns executable descriptors, while the effective execution allowlist is
    resolved from the durable agent snapshot at invocation time. MCP-compatible tools can
    be registered by providing a descriptor and a handler/bridge with the same callable
    contract as builtins.
    """

    def __init__(self) -> None:
        self._defs: dict[str, ToolDefinition] = {}
        self._fns: dict[str, ToolHandler] = {}
        self.register(
            ToolDefinition(
                "builtin.echo",
                "builtin_sync",
                "Echo text",
                {
                    "type": "object",
                    "required": ["text"],
                    "properties": {"text": {"type": "string"}},
                    "additionalProperties": False,
                },
                {
                    "type": "object",
                    "required": ["text"],
                    "properties": {"text": {"type": "string"}},
                    "additionalProperties": False,
                },
                side_effect_level="none",
            ),
            echo_tool,
        )
        self.register(
            ToolDefinition(
                "builtin.math_add",
                "builtin_sync",
                "Add numbers",
                {
                    "type": "object",
                    "required": ["a", "b"],
                    "properties": {"a": {"type": "number"}, "b": {"type": "number"}},
                    "additionalProperties": False,
                },
                {
                    "type": "object",
                    "required": ["result"],
                    "properties": {"result": {"type": "number"}},
                    "additionalProperties": False,
                },
                side_effect_level="none",
            ),
            math_add_tool,
        )

    def register(self, definition: ToolDefinition, handler: ToolHandler | None) -> None:
        if not definition.name:
            raise ValueError("tool definition name is required")
        self._defs[definition.name] = definition
        if handler is not None:
            self._fns[definition.name] = handler

    def resolve(self, name: str) -> tuple[ToolDefinition | None, ToolHandler | None]:
        return self._defs.get(name), self._fns.get(name)

    def resolve_effective(self, snapshot: Mapping[str, Any] | None) -> set[str]:
        """Resolve the agent's effective tool allowlist from durable snapshot JSON.

        Supported shapes intentionally cover current and expected control-plane fields:
        - effective_tools: ["tool.name"] or [{"name": "tool.name", "enabled": true}]
        - effectiveToolNames / effective_tool_names: ["tool.name"]
        - tool_policy.allow / toolPolicy.allow: ["tool.name"]
        - tools.allowlist / tools.allowed: ["tool.name"]
        """
        if not isinstance(snapshot, Mapping):
            return set()

        names: set[str] = set()
        for key in ("effectiveToolNames", "effective_tool_names"):
            names.update(_coerce_tool_names(snapshot.get(key)))
        names.update(_coerce_tool_names(snapshot.get("effective_tools")))
        names.update(_coerce_tool_names(snapshot.get("effectiveTools")))

        for policy_key in ("tool_policy", "toolPolicy"):
            policy = snapshot.get(policy_key)
            if isinstance(policy, Mapping):
                names.update(_coerce_tool_names(policy.get("allow")))
                names.update(_coerce_tool_names(policy.get("allowed")))
                names.update(_coerce_tool_names(policy.get("allowlist")))

        tools = snapshot.get("tools")
        if isinstance(tools, Mapping):
            names.update(_coerce_tool_names(tools.get("allow")))
            names.update(_coerce_tool_names(tools.get("allowed")))
            names.update(_coerce_tool_names(tools.get("allowlist")))

        return names


def _coerce_tool_names(value: Any) -> set[str]:
    if not isinstance(value, list):
        return set()
    names: set[str] = set()
    for item in value:
        if isinstance(item, str) and item:
            names.add(item)
        elif isinstance(item, Mapping):
            name = item.get("name") or item.get("tool_name") or item.get("toolName")
            enabled = item.get("enabled", True)
            if isinstance(name, str) and name and enabled is not False:
                names.add(name)
    return names
