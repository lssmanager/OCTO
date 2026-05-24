import pytest

from app.tools.builtin.http_request import http_request_definition
from app.tools.descriptor_hash import compute_descriptor_hash
from app.tools.errors import ToolAlreadyRegisteredError, ToolDescriptorHashMismatchError, ToolDisabledError, ToolNameInvalidError, ToolNeedsReviewError, ToolNotFoundError
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


def test_single_char_name_and_hash_mismatch() -> None:
    r = ToolRegistry()
    t = http_request_definition()
    t.name = "a"
    r.register(t)
    assert r.resolve("a").name == "a"

    bad = http_request_definition()
    bad.name = "bad_hash"
    bad.descriptor_hash = "sha256:deadbeef"
    with pytest.raises(ToolDescriptorHashMismatchError):
        r.register(bad)


@pytest.mark.parametrize("status", [ToolStatus.APPROVED, ToolStatus.PENDING_REVIEW, ToolStatus.DISCOVERED, ToolStatus.REVOKED, ToolStatus.DISABLED])
def test_only_enabled_status_resolves(status: ToolStatus) -> None:
    r = ToolRegistry()
    t = http_request_definition()
    t.name = f"tool_{status.value.lower()}"
    t.status = status
    t.enabled = True
    r.register(t)
    with pytest.raises(ToolDisabledError):
        r.resolve(t.name)

    good = http_request_definition()
    good.name = "ok_enabled"
    good.status = ToolStatus.ENABLED
    good.enabled = True
    good.descriptor_hash = compute_descriptor_hash(good)
    r.register(good)
    assert r.resolve("ok_enabled").name == "ok_enabled"
