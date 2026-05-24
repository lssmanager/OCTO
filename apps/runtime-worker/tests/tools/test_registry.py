import pytest

from app.tools.builtin.http_request import http_request_definition
from app.tools.errors import ToolAlreadyRegisteredError, ToolDisabledError, ToolNameInvalidError, ToolNeedsReviewError, ToolNotFoundError
from app.tools.models import ToolStatus
from app.tools.registry import ToolRegistry


def test_registry_core() -> None:
    r = ToolRegistry()
    t = http_request_definition()
    r.register(t)
    assert r.resolve(t.name).name == t.name
    with pytest.raises(ToolAlreadyRegisteredError):
        r.register(t)
    with pytest.raises(ToolNotFoundError):
        r.resolve("missing_tool")


def test_disabled_and_needs_review() -> None:
    r = ToolRegistry()
    t = http_request_definition()
    t.status = ToolStatus.DISABLED
    r.register(t)
    with pytest.raises(ToolDisabledError):
        r.resolve(t.name)
    t2 = http_request_definition()
    t2.name = "http_request_2"
    t2.status = ToolStatus.NEEDS_REVIEW
    r.register(t2)
    with pytest.raises(ToolNeedsReviewError):
        r.resolve(t2.name)


def test_name_and_llm_format() -> None:
    r = ToolRegistry()
    t = http_request_definition()
    t.name = "http://bad"
    with pytest.raises(ToolNameInvalidError):
        r.register(t)
    t2 = http_request_definition()
    t2.name = "good_name"
    r.register(t2)
    fmt = r.to_llm_format(r.list_for_agent(["good_name"]))
    assert fmt[0]["function"]["name"] == "good_name"
    assert "output_schema" not in str(fmt)
