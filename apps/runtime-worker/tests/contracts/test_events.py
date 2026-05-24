import pytest
from app.contracts.events import EventEnvelope


def test_event_envelope_validates():
    event = EventEnvelope(
        event_id='evt-1',
        event_type='ExecutionQueued',
        tenant_id='tenant-a',
        aggregate_type='Execution',
        aggregate_id='exe-1',
        sequence=0,
        trace_id='trace',
        span_id='span',
        occurred_at='2026-05-24T00:00:00Z',
        schema_version='1.0',
        payload={'agentId': 'agent-1'},
    )
    assert event.schema_version == '1.0'


def test_event_envelope_rejects_schema_version():
    with pytest.raises(Exception):
        EventEnvelope(
            event_id='evt-1',
            event_type='ExecutionQueued',
            tenant_id='tenant-a',
            aggregate_type='Execution',
            aggregate_id='exe-1',
            sequence=0,
            trace_id='trace',
            span_id='span',
            occurred_at='2026-05-24T00:00:00Z',
            schema_version='2.0',
            payload={},
        )
