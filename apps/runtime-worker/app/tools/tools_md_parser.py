from __future__ import annotations

from pydantic import BaseModel, Field

from app.tools.registry import TOOL_NAME_PATTERN


class ParsedToolsMd(BaseModel):
    assigned_tools: list[str] = Field(default_factory=list)
    overrides_disabled: list[str] = Field(default_factory=list)
    invalid_names: list[str] = Field(default_factory=list)


class ToolsMdParser:
    def parse(self, content: str) -> ParsedToolsMd:
        assigned: list[str] = []
        disabled: list[str] = []
        invalid: list[str] = []
        section = None
        for raw in content.splitlines():
            line = raw.strip()
            if not line or line.startswith("#"):
                continue
            norm = line.lower().strip(':')
            if norm in {"assigned tools", "assigned"}:
                section = "assigned"
                continue
            if norm == "overrides":
                section = "overrides"
                continue
            if line.startswith("-"):
                line = line[1:].strip()
            if section == "assigned":
                if TOOL_NAME_PATTERN.match(line):
                    if line not in assigned:
                        assigned.append(line)
                else:
                    invalid.append(line)
            elif section == "overrides" and ":" in line:
                name, state = [x.strip() for x in line.split(":", 1)]
                if state == "disabled" and TOOL_NAME_PATTERN.match(name):
                    if name not in disabled:
                        disabled.append(name)
                else:
                    invalid.append(line)
        return ParsedToolsMd(assigned_tools=assigned, overrides_disabled=disabled, invalid_names=invalid)

    def render(self, parsed: ParsedToolsMd, level_name: str) -> str:
        assigned_lines = "\n".join(f"- {name}" for name in parsed.assigned_tools)
        disabled_lines = "\n".join(f"- {name}: disabled" for name in parsed.overrides_disabled)
        return f"# TOOLS.md for {level_name}\n\n## Assigned Tools\n\n{assigned_lines}\n\n## Overrides\n\n{disabled_lines}\n"
