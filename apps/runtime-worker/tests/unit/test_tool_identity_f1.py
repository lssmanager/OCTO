from __future__ import annotations

import json

from src import f1_runtime
from src.tools.executor import _build_idempotency_key, _hash_json


def test_stable_tool_call_key_ignores_replay_generated_tool_call_id_and_step_index() -> None:
    messages = [{"role": "user", "content": "same prompt"}]
    first = f1_runtime._attach_stable_tool_call_keys(
        execution_id="exec-1",
        messages=messages,
        tool_calls=[
            {"id": "call-a", "name": "builtin.echo", "arguments_json": json.dumps({"text": "hi"})}
        ],
    )[0]
    replay = f1_runtime._attach_stable_tool_call_keys(
        execution_id="exec-1",
        messages=messages,
        tool_calls=[
            {"id": "call-b", "name": "builtin.echo", "arguments_json": json.dumps({"text": "hi"})}
        ],
    )[0]

    args_hash = _hash_json({"text": "hi"})
    first_idem = _build_idempotency_key(
        execution_id="exec-1",
        tool_name="builtin.echo",
        semantic_tool_call_key=first["semantic_tool_call_key"],
        arguments_hash=args_hash,
    )
    replay_idem = _build_idempotency_key(
        execution_id="exec-1",
        tool_name="builtin.echo",
        semantic_tool_call_key=replay["semantic_tool_call_key"],
        arguments_hash=args_hash,
    )

    assert first["semantic_tool_call_key"] == replay["semantic_tool_call_key"]
    assert first_idem == replay_idem
