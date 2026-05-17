"""Runtime Worker configuration via pydantic-settings v2.

All settings can be overridden via environment variables or .env file.
Variable names are UPPER_CASE equivalents of the field names.
"""
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Typed, validated settings for the OCTO Runtime Worker."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ── Server ────────────────────────────────────────────────────────────────
    port: int = Field(default=8001, ge=1024, le=65535)
    host: str = Field(default="0.0.0.0")
    workers: int = Field(default=1, ge=1, le=16)

    # ── Control Plane ─────────────────────────────────────────────────────────
    api_url: str = Field(default="http://localhost:3001")
    api_internal_secret: str = Field(default="change-me-in-production")

    # ── Redis (BullMQ transport) ───────────────────────────────────────────────
    redis_url: str = Field(default="redis://localhost:6379")
    redis_max_connections: int = Field(default=10, ge=1)

    # ── LiteLLM proxy ─────────────────────────────────────────────────────────
    litellm_url: str = Field(default="http://localhost:4000")
    litellm_api_key: str = Field(default="sk-litellm-local")

    # ── Observability (OTEL) ──────────────────────────────────────────────────
    otel_exporter_otlp_endpoint: str = Field(default="http://localhost:4317")
    otel_service_name: str = Field(default="octo-runtime-worker")
    otel_service_version: str = Field(default="0.0.1-f0")
    otel_enabled: bool = Field(default=True)
    log_level: str = Field(default="INFO")
    log_format: str = Field(default="json")  # "json" | "console"

    # ── Execution limits ──────────────────────────────────────────────────────
    max_concurrent_executions: int = Field(default=10, ge=1, le=100)
    execution_timeout_secs: int = Field(default=300, ge=30)
