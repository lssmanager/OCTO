from app.tools.tools_md_parser import ToolsMdParser


def test_tools_md_parser() -> None:
    p = ToolsMdParser()
    parsed = p.parse("## Assigned Tools\n- a.tool\n- a.tool\n## Overrides\n- z.tool: disabled\n")
    assert parsed.assigned_tools == ["a.tool"]
    assert parsed.overrides_disabled == ["z.tool"]
    rendered = p.render(parsed, "Level")
    assert "# TOOLS.md for Level" in rendered
    reparsed = p.parse(rendered)
    assert reparsed.assigned_tools == ["a.tool"]
    assert reparsed.overrides_disabled == ["z.tool"]


def test_tools_md_parser_heading_variants() -> None:
    p = ToolsMdParser()
    parsed = p.parse("## Assigned Tools:\na.tool\n## Overrides\nz.tool: disabled\n")
    assert parsed.assigned_tools == ["a.tool"]
    assert parsed.overrides_disabled == ["z.tool"]
