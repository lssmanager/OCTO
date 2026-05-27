from __future__ import annotations

import asyncio

from src.llm_provider import resolve_models_from_snapshot


def test_model_routing_prefers_snapshot_order() -> None:
    snapshot = {
        "agent": {"modelPolicy": {"primaryModel": "openai/gpt-4.1-mini"}},
        "workspace": {"modelPolicy": {"primaryModel": "anthropic/claude-3-5-sonnet"}},
        "global": {"defaultModel": "gemini/gemini-2.5-flash"},
    }
    got = resolve_models_from_snapshot(snapshot, "openai/gpt-4o-mini")
    assert got[0] == "openai/gpt-4.1-mini"
    assert "openai/gpt-4o-mini" in got


def test_fake_mode_returns_deterministic(monkeypatch) -> None:
    monkeypatch.setenv("OCTO_TEST_LLM_FAKE", "true")
    from src.llm_provider import call_llm

    res = asyncio.run(call_llm("t1", "e1", "a1", [{"role": "user", "content": "hi"}], {}))
    assert res.content == "F1 fake LLM response"
    assert res.usage["total_tokens"] == 15
