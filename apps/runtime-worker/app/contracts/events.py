from typing import Any, Literal
from pydantic import BaseModel, Field, field_validator


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

    @field_validator('trace_id')
    @classmethod
    def validate_trace_id(cls, v: str) -> str:
        if len(v) != 32 or not all(c in '0123456789abcdef' for c in v):
            raise ValueError('trace_id must be exactly 32 lowercase hexadecimal characters')
        return v

    @field_validator('span_id')
    @classmethod
    def validate_span_id(cls, v: str) -> str:
        if len(v) != 16 or not all(c in '0123456789abcdef' for c in v):
            raise ValueError('span_id must be exactly 16 lowercase hexadecimal characters')
        return v
