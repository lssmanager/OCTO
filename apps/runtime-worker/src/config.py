from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    port: int = 8001
    host: str = "0.0.0.0"
    api_url: str = "http://localhost:3001"
    redis_url: str = "redis://localhost:6379"
    litellm_url: str = "http://localhost:4000"
    litellm_api_key: str = "sk-litellm-local"
    otel_exporter_otlp_endpoint: str = "http://localhost:4317"
    otel_service_name: str = "octo-runtime-worker"

    class Config:
        env_file = ".env"
        extra = "ignore"
