"""Observability setup — structlog JSON logging + OpenTelemetry tracing.

ADR F0-015: Observabilidad es first-class desde F0.
Todo execution debe incluir trace_id, execution_id, run_id, agent_id en logs.

Patrones:
  - structlog: logging estructurado JSON con campos bound por contexto
  - OTEL: trazas distribuidas con propagación de trace_id desde el Control Plane
  - setup_logging() y setup_tracing() se llaman en lifespan startup
"""
from __future__ import annotations

import logging
import sys

import structlog


def setup_logging(log_level: str = "INFO", log_format: str = "json") -> None:
    """Configura structlog con JSON logging para producción.

    En desarrollo (log_format=console) usa ConsoleRenderer para
    output human-readable. En producción siempre JSON.

    El procesador `add_log_level` y `add_logger_name` enriquecen
    automáticamente todos los log events con metadata estándar.
    """
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        structlog.stdlib.add_log_level,
        structlog.stdlib.add_logger_name,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    if log_format == "console":
        renderer: structlog.types.Processor = structlog.dev.ConsoleRenderer()
    else:
        renderer = structlog.processors.JSONRenderer()

    structlog.configure(
        processors=[
            *shared_processors,
            structlog.stdlib.ProcessorFormatter.wrap_for_formatter,
        ],
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(logging, log_level.upper(), logging.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )

    formatter = structlog.stdlib.ProcessorFormatter(
        processors=[
            structlog.stdlib.ProcessorFormatter.remove_processors_meta,
            renderer,
        ],
        foreign_pre_chain=shared_processors,
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger()
    root_logger.handlers = [handler]
    root_logger.setLevel(log_level.upper())

    # Silenciar loggers ruidosos de librerías
    logging.getLogger("uvicorn.access").propagate = False
    logging.getLogger("httpx").setLevel(logging.WARNING)


def setup_tracing(service_name: str, otlp_endpoint: str, enabled: bool = True) -> None:
    """Configura OpenTelemetry tracing con OTLP exporter.

    Si enabled=False (desarrollo sin colector), no se inicializa nada.
    El trace_id sigue propagándose en structlog vía bind() aunque OTEL esté off.

    En producción: otlp_endpoint apunta al otel-collector (Principio #9).
    """
    if not enabled:
        structlog.get_logger(__name__).info(
            "tracing.disabled",
            service=service_name,
            reason="OTEL_ENABLED=false",
        )
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        resource = Resource.create(
            {
                "service.name": service_name,
                "service.version": "0.0.1-f0",
            }
        )
        provider = TracerProvider(resource=resource)
        exporter = OTLPSpanExporter(endpoint=f"{otlp_endpoint}/v1/traces")
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)

        structlog.get_logger(__name__).info(
            "tracing.configured",
            service=service_name,
            endpoint=otlp_endpoint,
        )
    except ImportError:
        structlog.get_logger(__name__).warning(
            "tracing.skipped",
            reason="opentelemetry packages not installed",
        )


def instrument_app(app: object) -> None:
    """Instrumenta la app FastAPI con OTEL middleware si está disponible."""
    try:
        from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor  # type: ignore[import]

        FastAPIInstrumentor.instrument_app(app)  # type: ignore[arg-type]
    except ImportError:
        pass
