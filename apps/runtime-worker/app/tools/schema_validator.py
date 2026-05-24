from __future__ import annotations

from typing import Any

from jsonschema import Draft7Validator
from jsonschema.exceptions import SchemaError, ValidationError

from app.tools.errors import ToolInputValidationError, ToolOutputValidationError
from app.tools.models import ToolDefinition

EMPTY_OBJECT_SCHEMA = {"type": "object", "properties": {}, "additionalProperties": False}


class SchemaValidator:
    def validate_schema(self, schema: dict[str, Any]) -> None:
        if not schema:
            raise ValueError("schema must not be empty")
        try:
            Draft7Validator.check_schema(schema)
        except SchemaError as exc:
            raise ValueError(f"invalid JSON schema: {exc.message}") from exc

    def validate_input(self, tool: ToolDefinition, args: dict[str, Any]) -> None:
        self._validate_payload(tool.input_schema, args, ToolInputValidationError, tool.name)

    def validate_output(self, tool: ToolDefinition, result: dict[str, Any]) -> None:
        self._validate_payload(tool.output_schema, result, ToolOutputValidationError, tool.name)

    def _validate_payload(self, schema: dict[str, Any], payload: dict[str, Any], error_type: type[Exception], tool_name: str) -> None:
        try:
            Draft7Validator(schema).validate(payload)
        except ValidationError as exc:
            msg = f"tool '{tool_name}' schema validation failed: {exc.message}"
            raise error_type(msg) from exc
