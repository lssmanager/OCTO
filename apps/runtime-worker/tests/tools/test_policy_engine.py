from app.tools.builtin.http_request import http_request_definition
from app.tools.models import AgentPolicy, AgentToolPolicy, ApprovalPolicy, PolicyOutcome, SideEffectLevel
from app.tools.policy_engine import PolicyEngine


def test_policy_engine_paths() -> None:
    pe = PolicyEngine()
    t = http_request_definition()
    policy = AgentPolicy(tool_policy=AgentToolPolicy(allow=[t.name]))
    ok = pe.validate_tool_call(t, policy, "tenant", "exe", "agent", [t.name])
    assert ok.outcome == PolicyOutcome.ALLOWED
    denied = pe.validate_tool_call(t, AgentPolicy(tool_policy=AgentToolPolicy(allow=["other"])), "tenant", "exe", "agent", [t.name])
    assert denied.outcome == PolicyOutcome.DENIED
    t.requires_approval = True
    req = pe.validate_tool_call(t, policy, "tenant", "exe", "agent", [t.name])
    assert req.outcome == PolicyOutcome.REQUIRES_APPROVAL
    t.requires_approval = False
    t.side_effect_level = SideEffectLevel.HIGH
    t.approval_policy = ApprovalPolicy.ALWAYS_REQUIRE
    req2 = pe.validate_tool_call(t, policy, "tenant", "exe", "agent", [t.name])
    assert req2.outcome == PolicyOutcome.REQUIRES_APPROVAL
