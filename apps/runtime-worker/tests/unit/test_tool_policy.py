from src.tools.policy import authorize_tool
from src.tools.definitions import ToolDefinition


def test_policy_denies_unknown_or_disabled():
    decision, code = authorize_tool(None, 't1')
    assert decision == 'deny' and code == 'TOOL_NOT_ALLOWED'
    td = ToolDefinition('x','builtin_sync','d',{}, {}, enabled=False)
    decision, code = authorize_tool(td, 't1')
    assert decision == 'deny'


def test_policy_requires_approval_for_high_side_effect():
    td = ToolDefinition('x','builtin_sync','d',{}, {}, side_effect_level='high')
    decision, code = authorize_tool(td, 't1')
    assert decision == 'approval_required' and code == 'TOOL_APPROVAL_REQUIRED'
