from __future__ import annotations

from src.f1_runtime import _messages_from_state


def test_reclaim_uses_materialized_checkpoint_messages_not_historical_writes() -> None:
    latest_state = {
        "messages": [
            {"role": "user", "content": "hello"},
            {"role": "assistant", "content": "", "tool_calls": [{"id": "tc1"}]},
            {"role": "tool", "tool_call_id": "tc1", "content": "ok"},
        ]
    }

    messages = _messages_from_state(latest_state, {"prompt": "fallback"})

    assert messages == latest_state["messages"]
    assert len([m for m in messages if m.get("role") == "tool"]) == 1
