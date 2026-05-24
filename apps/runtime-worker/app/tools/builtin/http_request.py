from app.tools.models import ApprovalPolicy, SideEffectLevel, ToolDefinition, ToolKind


def http_request_definition() -> ToolDefinition:
    return ToolDefinition(
        name="http_request",
        kind=ToolKind.BUILTIN_SYNC,
        description="Perform controlled HTTP request",
        input_schema={"type": "object", "required": ["method", "url"], "properties": {"method": {"type": "string", "enum": ["GET", "POST"]}, "url": {"type": "string", "format": "uri"}, "headers": {"type": "object", "additionalProperties": {"type": "string"}}, "body": {"type": ["object", "array", "string", "null"]}, "timeout_ms": {"type": "integer", "minimum": 1000, "maximum": 30000}}, "additionalProperties": False},
        output_schema={"type": "object", "required": ["status_code", "headers", "body"], "properties": {"status_code": {"type": "integer"}, "headers": {"type": "object", "additionalProperties": {"type": "string"}}, "body": {}}, "additionalProperties": False},
        side_effect_level=SideEffectLevel.LOW,
        approval_policy=ApprovalPolicy.POLICY_BASED,
        network_policy="egress_allowlist",
    )
