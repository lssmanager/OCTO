from __future__ import annotations

from src.f1_runtime import _reconstruct_messages_from_checkpoint_lineage


def test_reclaim_rebuilds_assistant_tool_call_before_tool_result() -> None:
    checkpoints = [
        {
            "id": "cp0",
            "step_index": 0,
            "parent_checkpoint_id": None,
            "state_json": {"messages": [{"role": "user", "content": "hello"}]},
        },
        {
            "id": "cp1",
            "step_index": 1,
            "parent_checkpoint_id": "cp0",
            "state_json": {"messages": [{"role": "user", "content": "hello"}]},
        },
    ]
    writes_by_checkpoint = {
        "cp1": [
            {
                "write_index": 0,
                "channel": "messages",
                "type": "assistant_message",
                "value_json": {
                    "role": "assistant",
                    "content": "",
                    "tool_calls": [
                        {
                            "id": "tc1",
                            "name": "builtin.echo",
                            "arguments_json": '{"text":"hello"}',
                        }
                    ],
                },
            },
            {
                "write_index": 1,
                "channel": "messages",
                "type": "tool_result",
                "value_json": {
                    "type": "tool_result",
                    "tool_name": "builtin.echo",
                    "tool_call_id": "tc1",
                    "status": "succeeded",
                    "result": {"text": "hello"},
                },
            },
        ]
    }

    messages = _reconstruct_messages_from_checkpoint_lineage(checkpoints, writes_by_checkpoint, {"task": "hello"})

    assert [message["role"] for message in messages] == ["user", "assistant", "tool"]
    assert messages[1]["tool_calls"][0]["id"] == "tc1"
    assert messages[2]["tool_call_id"] == "tc1"


def test_reclaim_keeps_more_complete_history_when_later_checkpoint_is_sparse() -> None:
    checkpoints = [
        {
            "id": "cp0",
            "step_index": 0,
            "parent_checkpoint_id": None,
            "state_json": {"messages": [{"role": "user", "content": "hello"}]},
        },
        {
            "id": "cp1",
            "step_index": 1,
            "parent_checkpoint_id": "cp0",
            "state_json": {"messages": [{"role": "assistant", "content": "done"}]},
        },
    ]

    messages = _reconstruct_messages_from_checkpoint_lineage(checkpoints, {}, {"task": "hello"})

    assert messages == [{"role": "user", "content": "hello"}]
