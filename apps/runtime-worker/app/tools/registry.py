from __future__ import annotations

import re

from app.tools.descriptor_hash import compute_descriptor_hash
from app.tools.errors import ToolAlreadyRegisteredError, ToolDescriptorHashMismatchError, ToolDisabledError, ToolNameInvalidError, ToolNeedsReviewError, ToolNotFoundError
from app.tools.models import SideEffectLevel, ToolDefinition, ToolKind, ToolStatus
from app.tools.schema_validator import SchemaValidator

TOOL_NAME_PATTERN = re.compile(r"^[a-zA-Z][a-zA-Z0-9_.-]{0,126}$")


class ToolRegistry:
    def __init__(self) -> None:
        self._registry: dict[str, ToolDefinition] = {}
        self._validator = SchemaValidator()

    def register(self, definition: ToolDefinition) -> None:
        self._validate_name(definition.name)
        if definition.name in self._registry:
            raise ToolAlreadyRegisteredError(definition.name)
        self._validator.validate_schema(definition.input_schema)
        self._validator.validate_schema(definition.output_schema)
        if definition.side_effect_level == SideEffectLevel.HIGH and definition.approval_policy.value == "policy_based" and not definition.requires_approval:
            raise ValueError("high side effect tools require explicit approval policy")
        if definition.kind in {ToolKind.MCP_HTTP, ToolKind.MCP_STDIO} and not definition.source_ref:
            raise ValueError("mcp tools require source_ref")
        computed_hash = compute_descriptor_hash(definition)
        if definition.descriptor_hash is None:
            definition.descriptor_hash = computed_hash
        elif definition.descriptor_hash != computed_hash:
            raise ToolDescriptorHashMismatchError(definition.name)
        self._registry[definition.name] = definition

    def resolve(self, name: str) -> ToolDefinition:
        tool = self._registry.get(name)
        if tool is None:
            raise ToolNotFoundError(name)
        if tool.status == ToolStatus.NEEDS_REVIEW:
            raise ToolNeedsReviewError(name)
        if tool.status is not ToolStatus.ENABLED or not tool.enabled:
            raise ToolDisabledError(name)
        return tool

    def list_for_agent(self, allowed_names: list[str], strict: bool = True) -> list[ToolDefinition]:
        tools: list[ToolDefinition] = []
        for name in allowed_names:
            if not strict and name not in self._registry:
                continue
            tools.append(self.resolve(name))
        return tools

    def to_llm_format(self, tools: list[ToolDefinition]) -> list[dict[str, object]]:
        return [{"type": "function", "function": {"name": t.name, "description": t.description, "parameters": t.input_schema}} for t in tools]

    def all(self) -> list[ToolDefinition]:
        return list(self._registry.values())

    def _validate_name(self, name: str) -> None:
        if not TOOL_NAME_PATTERN.match(name):
            raise ToolNameInvalidError(name)
        if "//" in name or name.startswith(("http.", "https.")):
            raise ToolNameInvalidError(name)
