from app.tools.models import ApprovalPolicy, SideEffectLevel, ToolDefinition, ToolKind


def wait_for_event_definition() -> ToolDefinition:
    return ToolDefinition(
        name="wait_for_event",
        kind=ToolKind.BUILTIN_ASYNC,
        description="Wait for an external event",
        input_schema={"type": "object", "required": ["event_type"], "properties": {"event_type": {"type": "string", "minLength": 1, "maxLength": 128}, "correlation_id": {"type": "string", "maxLength": 256}, "timeout_ms": {"type": "integer", "minimum": 1000, "maximum": 900000}}, "additionalProperties": False},
        output_schema={"type": "object", "required": ["event_received", "payload"], "properties": {"event_received": {"type": "boolean"}, "payload": {}}, "additionalProperties": False},
        side_effect_level=SideEffectLevel.NONE,
        approval_policy=ApprovalPolicy.POLICY_BASED,
    )
