from app.tools.models import ApprovalPolicy, SideEffectLevel, ToolDefinition, ToolKind


def json_transform_definition() -> ToolDefinition:
    return ToolDefinition(
        name="json_transform", kind=ToolKind.BUILTIN_SYNC, description="Apply JSON transform expression",
        input_schema={"type": "object", "required": ["input", "expression"], "properties": {"input": {}, "expression": {"type": "string", "minLength": 1, "maxLength": 4096}}, "additionalProperties": False},
        output_schema={"type": "object", "required": ["result"], "properties": {"result": {}}, "additionalProperties": False},
        side_effect_level=SideEffectLevel.NONE, approval_policy=ApprovalPolicy.NEVER_REQUIRE,
    )


def execute_json_transform(args: dict) -> dict:
    value = args.get("input")
    expression = args.get("expression", "")
    if expression == "identity":
        return {"result": value}
    if expression == "keys":
        return {"result": list(value.keys()) if isinstance(value, dict) else []}
    if expression == "length":
        return {"result": len(value) if hasattr(value, "__len__") else 0}
    if expression.startswith("pick:"):
        key = expression.split(":", 1)[1]
        if isinstance(value, dict):
            return {"result": {key: value.get(key)}}
    if expression.startswith("get:"):
        key = expression.split(":", 1)[1]
        if isinstance(value, dict):
            return {"result": value.get(key)}
    return {"result": {"error_code": "JSON_TRANSFORM_UNSUPPORTED_EXPRESSION", "message": "Expression is not supported in F1"}}
