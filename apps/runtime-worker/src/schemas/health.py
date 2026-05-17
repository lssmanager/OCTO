"""Health schemas — respuestas de los endpoints /health."""
from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class OctoModel(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
        extra="forbid",
        str_strip_whitespace=True,
    )


class DependencyStatus(StrEnum):
    OK = "ok"
    DEGRADED = "degraded"
    DOWN = "down"


class HealthDetail(OctoModel):
    name: str
    status: DependencyStatus
    latency_ms: int | None = None
    error: str | None = None


class HealthResponse(OctoModel):
    """Respuesta del GET /health raíz.

    El campo `phase` identifica en qué fase de desarrollo está el servicio.
    Criterio de aceptación: {status, service, version, phase: F0}.
    """

    status: DependencyStatus
    service: str
    version: str
    phase: str = Field(default="F0")
    checks: list[HealthDetail] = Field(default_factory=list)
