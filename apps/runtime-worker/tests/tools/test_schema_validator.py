import pytest

from app.tools.builtin.http_request import http_request_definition
from app.tools.schema_validator import SchemaValidator


def test_schema_validator_input_output() -> None:
    v = SchemaValidator()
    t = http_request_definition()
    v.validate_input(t, {"method": "GET", "url": "https://example.com"})
    with pytest.raises(Exception):
        v.validate_input(t, {"url": "https://example.com"})
    with pytest.raises(Exception):
        v.validate_input(t, {"method": "GET", "url": "https://example.com", "x": 1})
    v.validate_output(t, {"status_code": 200, "headers": {}, "body": {}})
    with pytest.raises(Exception):
        v.validate_output(t, {"status_code": 200})
