"""Runtime Worker configuration via pydantic-settings v2.

Fails fast on startup: if any required variable is missing or invalid,
pydantic raises ValidationError with a clear list of ALL problems at once.
This replicates the n8n fail-fast pattern (F0-016-env-config-strategy.md).

Variable names are UPPER_CASE env var names mapped to snake_case fields.
"""

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed, validated settings for the OCTO Runtime Worker."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ── Server ────────────────────────────────────────────────────────────────
    port: int = Field(default=8001, ge=1024, le=65535)
    host: str = Field(default="0.0.0.0")
    workers: int = Field(default=1, ge=1, le=16)

    # ── Control Plane inter-service secret ────────────────────────────────────
    # NO default — must be explicitly set. Matches RUNTIME_API_SECRET on API side.
    # Architecture Principle #1: Execution Plane never self-authorizes.
    api_internal_secret: str = Field(min_length=32)

    # ── Control Plane URL ─────────────────────────────────────────────────────
    # Required for health check connectivity probe towards the API.
    # health.py uses this to verify the control plane is reachable.
    api_url: str = Field(
        default="http://api:3001/api",
        description="Base URL of the NestJS Control Plane API",
    )

    # ── Database ──────────────────────────────────────────────────────────────
    # NOTE: runtime-worker reads DB only for health checks.
    # Orchestration and writes go through the control plane (Principle #1).
    database_url: str = Field(pattern=r"^postgresql://")

    # ── Redis (BullMQ transport) ───────────────────────────────────────────────
    redis_url: str = Field(pattern=r"^redis://")
    redis_max_connections: int = Field(default=10, ge=1)

    # ── LiteLLM proxy ─────────────────────────────────────────────────────────
    litellm_url: str = Field(default="http://litellm:4000")
    litellm_api_key: str = Field(min_length=16)

    # ── Observability (OTEL) ──────────────────────────────────────────────────
    otel_exporter_otlp_endpoint: str = Field(default="http://otel-collector:4318")
    otel_service_name: str = Field(default="octo-runtime-worker")
    otel_service_version: str = Field(default="0.0.1-f0")
    otel_enabled: bool = Field(default=True)
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="json")  # "json" | "console"

    # ── Execution limits ──────────────────────────────────────────────────────
    max_concurrent_executions: int = Field(default=10, ge=1, le=100)
    execution_timeout_secs: int = Field(default=300, ge=30)
    # MAX_EXECUTION_TIMEOUT_MS — issue #10 criterion.
    # Exposed as milliseconds for callers; internally maps to execution_timeout_secs.
    # env var: MAX_EXECUTION_TIMEOUT_MS (takes precedence if set).
    max_execution_timeout_ms: int = Field(
        default=300_000,
        ge=30_000,
        description="Hard execution timeout in milliseconds (env: MAX_EXECUTION_TIMEOUT_MS)",
    )

    # ── Build info ────────────────────────────────────────────────────────────
    build_version: str = Field(default="0.0.1-f0")
    build_commit: str = Field(default="unknown")
    build_phase: str = Field(default="F0")

    @field_validator("log_level")
    @classmethod
    def validate_log_level(cls, v: str) -> str:
        valid = {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}
        upper = v.upper()
        if upper not in valid:
            raise ValueError(f"log_level must be one of {valid}, got '{v}'")
        return upper


def get_settings() -> Settings:
    """
    Returns validated Settings singleton.
    Raises pydantic.ValidationError on startup if any required field is
    missing or invalid — lists ALL problems at once (fail-fast).
    """
    return Settings()
