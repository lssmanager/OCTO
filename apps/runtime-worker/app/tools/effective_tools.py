from __future__ import annotations

from typing import Literal

from pydantic import BaseModel

from app.tools.errors import ToolContextValidationError, ToolNeedsReviewError
from app.tools.models import EffectiveToolContext
from app.tools.registry import ToolRegistry
from app.tools.tools_md_parser import ToolsMdParser


class HierarchyToolLevel(BaseModel):
    level_id: str
    level_type: Literal["agency", "department", "workspace", "agent", "subagent"]
    level_name: str
    status: Literal["ACTIVE", "INACTIVE", "ARCHIVED"]
    tools_md_content: str


class EffectiveToolsResolver:
    def __init__(self) -> None:
        self._parser = ToolsMdParser()

    def resolve(self, levels_specific_to_general: list[HierarchyToolLevel], registry: ToolRegistry, strict: bool = True) -> EffectiveToolContext:
        effective_tools: list[str] = []
        disabled_by_override: list[str] = []
        disabled_set: set[str] = set()
        needs_review: list[str] = []
        hierarchy_path: list[str] = []

        for level in levels_specific_to_general:
            hierarchy_path.append(level.level_id)
            if level.status in {"INACTIVE", "ARCHIVED"}:
                continue
            parsed = self._parser.parse(level.tools_md_content)
            if strict and parsed.invalid_names:
                raise ToolContextValidationError(f"invalid tool names: {parsed.invalid_names}")
            for name in parsed.overrides_disabled:
                if name not in disabled_set:
                    disabled_set.add(name)
                    disabled_by_override.append(name)
                if name in effective_tools:
                    effective_tools.remove(name)
            for name in parsed.assigned_tools:
                if name in disabled_set:
                    continue
                if name not in effective_tools:
                    effective_tools.append(name)

        if strict:
            for name in [*effective_tools, *disabled_by_override]:
                try:
                    registry.resolve(name)
                except ToolNeedsReviewError:
                    needs_review.append(name)
                    raise
                except Exception as exc:
                    raise ToolContextValidationError(str(exc)) from exc

        return EffectiveToolContext(hierarchy_path=hierarchy_path, effective_tool_names=effective_tools, disabled_by_override=disabled_by_override, needs_review=needs_review)
