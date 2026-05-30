from src.tools.definitions import ToolDefinition
from src.tools.policy import authorize_tool
from src.tools.registry import ToolRegistry


def test_effective_allowlist_from_snapshot_allows_tool():
    registry = ToolRegistry()
    definition, _ = registry.resolve("builtin.echo")

    decision = authorize_tool(
        definition,
        "tenant-1",
        agent_id="agent-1",
        tool_name="builtin.echo",
        effective_tool_names=registry.resolve_effective({"effectiveToolNames": ["builtin.echo"]}),
        snapshot={"effectiveToolNames": ["builtin.echo"]},
    )

    assert decision.outcome == "allow"


def test_tool_not_in_effective_allowlist_is_denied():
    registry = ToolRegistry()
    definition, _ = registry.resolve("builtin.echo")

    decision = authorize_tool(
        definition,
        "tenant-1",
        tool_name="builtin.echo",
        effective_tool_names=registry.resolve_effective({"effectiveToolNames": ["builtin.math_add"]}),
        snapshot={"effectiveToolNames": ["builtin.math_add"]},
    )

    assert decision.outcome == "deny"
    assert decision.code == "TOOL_NOT_ALLOWED"


def test_snapshot_requires_tool_approval():
    registry = ToolRegistry()
    definition, _ = registry.resolve("builtin.echo")
    snapshot = {"effectiveToolNames": ["builtin.echo"], "tool_policy": {"require_approval": ["builtin.echo"]}}

    decision = authorize_tool(
        definition,
        "tenant-1",
        tool_name="builtin.echo",
        effective_tool_names=registry.resolve_effective(snapshot),
        snapshot=snapshot,
    )

    assert decision.outcome == "approval_required"
    assert decision.code == "TOOL_APPROVAL_REQUIRED"


def test_high_side_effect_tool_requires_approval_when_allowlisted():
    definition = ToolDefinition(
        "custom.delete",
        "builtin_sync",
        "delete",
        {"type": "object"},
        {"type": "object"},
        side_effect_level="high",
    )

    decision = authorize_tool(
        definition,
        "tenant-1",
        tool_name="custom.delete",
        effective_tool_names={"custom.delete"},
        snapshot={"effectiveToolNames": ["custom.delete"]},
    )

    assert decision.outcome == "approval_required"
