from app.tools.models import ApprovalPolicy, SideEffectLevel, ToolDefinition, ToolKind
from app.tools.egress_policy import EgressPolicyError, validate_endpoint_against_egress_policy


def http_request_definition() -> ToolDefinition:
    return ToolDefinition(
        name="http_request", kind=ToolKind.BUILTIN_SYNC, description="Perform controlled HTTP request",
        input_schema={"type": "object", "required": ["method", "url"], "properties": {"method": {"type": "string", "enum": ["GET", "POST"]}, "url": {"type": "string", "format": "uri"}, "headers": {"type": "object", "additionalProperties": {"type": "string"}}, "body": {"type": ["object", "array", "string", "null"]}, "timeout_ms": {"type": "integer", "minimum": 1000, "maximum": 30000}}, "additionalProperties": False},
        output_schema={"type": "object", "required": ["status_code", "headers", "body"], "properties": {"status_code": {"type": "integer"}, "headers": {"type": "object", "additionalProperties": {"type": "string"}}, "body": {}}, "additionalProperties": False},
        side_effect_level=SideEffectLevel.LOW, approval_policy=ApprovalPolicy.POLICY_BASED, network_policy="egress_allowlist",
    )


def execute_http_request(args: dict) -> dict:
    try:
        validate_endpoint_against_egress_policy(
            url=str(args.get("url", "")),
            network_policy="egress_allowlist",
            egress_allowlist=[],
        )
    except EgressPolicyError:
        return {"status_code": 0, "headers": {}, "body": {"error_code": "TOOL_EGRESS_DENIED", "message": "Egress denied by policy."}}
    return {"status_code": 0, "headers": {}, "body": {"error_code": "HTTP_REQUEST_EGRESS_POLICY_NOT_CONFIGURED", "message": "Egress policy is not configured for F1."}}
