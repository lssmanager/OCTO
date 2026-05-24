from app.tools.models import ApprovalPolicy, SideEffectLevel, ToolDefinition, ToolKind


def json_transform_definition() -> ToolDefinition:
    return ToolDefinition(
        name="json_transform",
        kind=ToolKind.BUILTIN_SYNC,
        description="Apply JSON transform expression",
        input_schema={"type": "object", "required": ["input", "expression"], "properties": {"input": {}, "expression": {"type": "string", "minLength": 1, "maxLength": 4096}}, "additionalProperties": False},
        output_schema={"type": "object", "required": ["result"], "properties": {"result": {}}, "additionalProperties": False},
        side_effect_level=SideEffectLevel.NONE,
        approval_policy=ApprovalPolicy.NEVER_REQUIRE,
    )
