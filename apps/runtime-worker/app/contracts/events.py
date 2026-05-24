from typing import Any, Literal
from pydantic import BaseModel, Field


class EventEnvelope(BaseModel):
    event_id: str = Field(min_length=1)
    event_type: str = Field(min_length=1)
    tenant_id: str = Field(min_length=1)
    aggregate_type: str = Field(min_length=1)
    aggregate_id: str = Field(min_length=1)
    sequence: int = Field(ge=0)
    trace_id: str = Field(min_length=1)
    span_id: str = Field(min_length=1)
    occurred_at: str
    schema_version: Literal['1.0'] = '1.0'
    payload: dict[str, Any]
