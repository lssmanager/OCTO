from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.contracts.generated.ExecutionSchema import ExecutionSchema
from app.contracts.generated.ExecutionCheckpointSchema import ExecutionCheckpointSchema
from app.contracts.generated.ToolInvocationSchema import ToolInvocationSchema
from app.contracts.generated.OutboxEventSchema import OutboxEventSchema


def test_execution_valid():
    m = ExecutionSchema.model_validate({
        "id": "e1", "tenantId": "t1", "agentId": "a1", "agentVersionId": "av1", "state": "running",
        "version": 1, "inputJson": {}, "attemptCount": 0, "reclaimCount": 0,
        "createdBy": "u1", "createdAt": "2026-01-01T00:00:00Z", "updatedAt": "2026-01-01T00:00:00Z",
    })
    assert m.id == "e1"


def test_checkpoint_valid():
    m = ExecutionCheckpointSchema.model_validate({
        "id": "c1", "executionId": "e1", "tenantId": "t1", "stepIndex": 1, "source": "tool",
        "stateJson": {}, "channelVersions": {"ch": 1}, "versionsSeen": {"ch": {"a": 1}},
        "metadataJson": {}, "createdAt": "2026-01-01T00:00:00Z",
    })
    assert m.id == "c1"


def test_tool_invocation_valid():
    m = ToolInvocationSchema.model_validate({
        "id": "ti1", "tenantId": "t1", "executionId": "e1", "stepId": "s1", "toolName": "search",
        "toolKind": "builtin_sync", "status": "PENDING", "argsJson": {}, "requiresApproval": False,
        "idempotencyKey": "idem", "startedAt": "2026-01-01T00:00:00Z",
    })
    assert m.id == "ti1"


def test_outbox_valid():
    m = OutboxEventSchema.model_validate({
        "id": "o1", "tenantId": "t1", "aggregateType": "execution", "aggregateId": "e1",
        "eventType": "ExecutionQueued", "sequence": 1, "payloadJson": {}, "createdAt": "2026-01-01T00:00:00Z",
    })
    assert m.id == "o1"


def test_invalid_enum_fails():
    with pytest.raises(ValidationError):
        OutboxEventSchema.model_validate({
            "id": "o1", "tenantId": "t1", "aggregateType": "execution", "aggregateId": "e1",
            "eventType": "Nope", "sequence": 1, "payloadJson": {}, "createdAt": "2026-01-01T00:00:00Z",
        })
