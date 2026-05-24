from app.tools.builtin.http_request import http_request_definition
from app.tools.descriptor_hash import compute_descriptor_hash


def test_descriptor_hash_stability() -> None:
    t = http_request_definition()
    h1 = compute_descriptor_hash(t)
    h2 = compute_descriptor_hash(t)
    assert h1 == h2
    t.input_schema["properties"]["method"]["enum"] = ["GET"]
    assert compute_descriptor_hash(t) != h1
