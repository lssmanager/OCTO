"""OpenTelemetry bootstrap for the Runtime Worker.

Must be imported and initialised BEFORE any other application module
so that auto-instrumentation patches are applied at import time.
"""
import logging

import structlog
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

from .config import Settings

AGENT_SPAN_ATTRS = {
    "agent.id": "agent_id",
    "agent.role": "agent_role",
    "llm.model": "model",
    "llm.prompt_tokens": "prompt_tokens",
    "llm.completion_tokens": "completion_tokens",
    "governance.token_budget": "token_budget",
    "governance.iterations": "iterations",
}


def setup_logging(settings: Settings) -> None:
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    renderer: structlog.types.Processor = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        foreign_pre_chain=shared_processors,
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
    )
    handler = logging.StreamHandler()
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(settings.log_level.upper())


def setup_tracing(settings: Settings) -> None:
    if not settings.otel_enabled:
        return

    resource = Resource.create(
        {
            "service.name": settings.otel_service_name,
            "service.version": settings.otel_service_version,
        }
    )
    exporter = OTLPSpanExporter(
        endpoint=f"{settings.otel_exporter_otlp_endpoint}/v1/traces"
    )
    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)


def configure_telemetry(settings: Settings) -> None:
    setup_logging(settings)
    setup_tracing(settings)


def instrument_app(app: object) -> None:
    FastAPIInstrumentor.instrument_app(app)  # type: ignore[arg-type]
