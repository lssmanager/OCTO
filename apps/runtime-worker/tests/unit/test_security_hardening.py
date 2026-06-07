from __future__ import annotations

from app.adapters.llm.provider_params import allowlisted_provider_params, resolve_provider
from app.cache.qdrant_semantic_cache import QdrantSemanticCache
from app.contracts.llm import CanonicalChatMessage, ChatCompletionRequest
from app.tools.descriptor_hash import compute_descriptor_hash
from app.tools.models import ToolDefinition, ToolKind
from src.tools.executor import _build_idempotency_key


def _request(content: str) -> ChatCompletionRequest:
    return ChatCompletionRequest(
        tenant_id="tenant-a",
        execution_id="exec-1",
        agent_id="agent-1",
        model="gpt-4.1-mini",
        messages=[CanonicalChatMessage(role="user", content=content)],
    )


def test_descriptor_hash_changes_when_access_controls_change() -> None:
    base = ToolDefinition(
        name="builtin.search",
        kind=ToolKind.BUILTIN_SYNC,
        description="search",
        input_schema={"type": "object"},
        output_schema={"type": "object"},
        allowed_roles=["ops"],
    )
    tightened = ToolDefinition(
        name="builtin.search",
        kind=ToolKind.BUILTIN_SYNC,
        description="search",
        input_schema={"type": "object"},
        output_schema={"type": "object"},
        allowed_roles=["ops"],
        allowed_scopes=["tools:write"],
    )

    assert compute_descriptor_hash(base) != compute_descriptor_hash(tightened)


def test_provider_resolution_handles_prefixed_and_alias_models() -> None:
    assert resolve_provider("openai/gpt-4.1") == "openai"
    assert resolve_provider("gpt-4.1-mini") == "openai"
    assert resolve_provider("claude-3-7-sonnet") == "anthropic"
    assert resolve_provider("custom-safe-alias") == "unknown"


def test_allowlisted_provider_params_drop_unknown_alias_bypass() -> None:
    params = {"top_p": 0.5, "headers": {"x-test": "nope"}}

    assert allowlisted_provider_params("custom-safe-alias", params) == {}
    assert allowlisted_provider_params("gpt-4.1-mini", params) == {"top_p": 0.5}


def test_semantic_cache_key_uses_full_message_payload() -> None:
    cache = QdrantSemanticCache()
    first = _request("A" * 128 + "-one")
    second = _request("A" * 128 + "-two")

    assert cache._key(first) != cache._key(second)


def test_tool_idempotency_key_is_stable_across_reclaim() -> None:
    args_hash = "abc123"

    first = _build_idempotency_key(
        execution_id="exec-1",
        tool_name="builtin.email.send",
        tool_call_id="call-1",
        arguments_hash=args_hash,
    )
    second = _build_idempotency_key(
        execution_id="exec-1",
        tool_name="builtin.email.send",
        tool_call_id="call-1",
        arguments_hash=args_hash,
    )

    assert first == second
