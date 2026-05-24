from datetime import UTC, datetime

import pytest
from pydantic import ValidationError

from app.checkpoints.models import CheckpointTuple, CheckpointWrite, ExecutionCheckpoint


def test_valid_checkpoint_model_parses() -> None:
    cp = ExecutionCheckpoint(
        id="cp1",
        execution_id="ex1",
        tenant_id="t1",
        step_index=1,
        source="loop",
        state_json={},
        channel_versions={"main": 1},
        versions_seen={"n1": {"main": 1}},
        created_at=datetime.now(UTC),
    )
    assert cp.id == "cp1"


def test_invalid_checkpoint_source_fails() -> None:
    with pytest.raises(ValidationError):
        ExecutionCheckpoint(
            id="cp1", execution_id="ex1", tenant_id="t1", step_index=1, source="bad", state_json={}, channel_versions={}, versions_seen={}, created_at=datetime.now(UTC)
        )


def test_valid_checkpoint_write_parses() -> None:
    w = CheckpointWrite(id="w1", checkpoint_id="cp1", tenant_id="t1", task_id="task", write_index=0, channel="main", value_json={"k": "v"})
    assert w.channel == "main"


def test_checkpoint_tuple_parses() -> None:
    cp = ExecutionCheckpoint(id="cp1", execution_id="ex1", tenant_id="t1", step_index=1, source="input", state_json={}, channel_versions={}, versions_seen={}, created_at=datetime.now(UTC))
    t = CheckpointTuple(checkpoint=cp, pending_writes=[])
    assert t.checkpoint.id == "cp1"


def test_metadata_json_default_works() -> None:
    cp = ExecutionCheckpoint(id="cp1", execution_id="ex1", tenant_id="t1", step_index=1, source="input", state_json={}, channel_versions={}, versions_seen={}, created_at=datetime.now(UTC))
    assert cp.metadata_json == {}


def test_task_path_default_works() -> None:
    w = CheckpointWrite(id="w1", checkpoint_id="cp1", tenant_id="t1", task_id="task", write_index=0, channel="main")
    assert w.task_path == ""


def test_channel_versions_accepts_int_and_string_values() -> None:
    cp = ExecutionCheckpoint(id="cp1", execution_id="ex1", tenant_id="t1", step_index=1, source="loop", state_json={}, channel_versions={"a": 1, "b": "v2"}, versions_seen={}, created_at=datetime.now(UTC))
    assert cp.channel_versions["b"] == "v2"


def test_versions_seen_validates_nested_shape() -> None:
    cp = ExecutionCheckpoint(id="cp1", execution_id="ex1", tenant_id="t1", step_index=1, source="loop", state_json={}, channel_versions={}, versions_seen={"node": {"x": "1", "y": 2}}, created_at=datetime.now(UTC))
    assert cp.versions_seen["node"]["y"] == 2
