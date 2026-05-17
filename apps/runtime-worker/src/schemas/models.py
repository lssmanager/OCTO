"""Model listing schema."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class OctoModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class ModelInfo(OctoModel):
    id: str
    provider: str
    context_window: int | None = None
    supports_function_calling: bool = False
    supports_streaming: bool = True
