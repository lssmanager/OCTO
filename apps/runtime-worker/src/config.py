"""Runtime Worker configuration via pydantic-settings v2.

Fails fast on startup: if any required variable is missing or invalid,
pydantic raises ValidationError with a clear list of ALL problems at once.
This replicates the n8n fail-fast pattern (F0-016-env-config-strategy.md).

Variable names are UPPER_CASE env var names mapped to snake_case fields.
"""

from pydantic import AliasChoices, Field, field_validator, model_validator
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
    # F1 current behavior: runtime-worker requires direct DB access because
    # execution-state durability is persisted from runtime paths implemented in
    # this repository. Least-privilege scope is documented as the F1 write
    # contract: executions, execution_steps, execution_checkpoints,
    # execution_checkpoint_writes, tool_invocations, approvals, outbox_events
    # and worker_heartbeats. Control Plane still owns user-facing orchestration
    # APIs, authz/policy and execution dispatch lifecycle.
    # RUNTIME_DATABASE_URL is the production/F1-close credential. DATABASE_URL
    # is accepted only as a legacy local/test fallback outside production and the
    # close gate. Code should read the resolved ``runtime_db_dsn`` property.
    runtime_database_url: str | None = Field(default=None, pattern=r"^postgresql://")
    database_url: str | None = Field(default=None, pattern=r"^postgresql://")

    # ── Redis (BullMQ transport) ───────────────────────────────────────────────
    redis_url: str = Field(pattern=r"^redis://")
    redis_max_connections: int = Field(default=10, ge=1)

    # ── LiteLLM proxy ─────────────────────────────────────────────────────────
    litellm_url: str = Field(
        default="http://litellm:4000",
        validation_alias=AliasChoices("LITELLM_URL", "LITELLM_BASE_URL"),
    )
    litellm_api_key: str = Field(
        min_length=16,
        validation_alias=AliasChoices("LITELLM_API_KEY", "LITELLM_MASTER_KEY"),
    )

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

    @model_validator(mode="after")
    def validate_runtime_database_url(self) -> "Settings":
        import os

        if self.runtime_database_url:
            return self
        if os.environ.get("F1_CLOSE_GATE") == "1" or os.environ.get("NODE_ENV") == "production":
            raise ValueError(
                "RUNTIME_DATABASE_URL is required for F1 close/production runtime-worker"
            )
        if not self.database_url:
            raise ValueError(
                "RUNTIME_DATABASE_URL is required; "
                "DATABASE_URL is only a non-production fallback"
            )
        return self

    @property
    def runtime_db_dsn(self) -> str:
        if self.runtime_database_url:
            return self.runtime_database_url
        if self.database_url:
            return self.database_url
        raise RuntimeError("RUNTIME_DATABASE_URL required")

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
