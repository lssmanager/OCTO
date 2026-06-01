from src.tools.policy import authorize_tool
from src.tools.definitions import ToolDefinition


def test_policy_denies_unknown_or_disabled():
    decision = authorize_tool(None, 't1')
    assert decision.outcome == 'deny' and decision.code == 'TOOL_NOT_ALLOWED'
    td = ToolDefinition('x', 'builtin_sync', 'd', {}, {}, enabled=False)
    decision = authorize_tool(td, 't1', effective_tool_names={'x'})
    assert decision.outcome == 'deny'


def test_policy_requires_approval_for_high_side_effect():
    td = ToolDefinition('x', 'builtin_sync', 'd', {}, {}, side_effect_level='high')
    decision = authorize_tool(td, 't1', effective_tool_names={'x'})
    assert decision.outcome == 'approval_required' and decision.code == 'TOOL_APPROVAL_REQUIRED'
