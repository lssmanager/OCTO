"""OpenTelemetry bootstrap for the OCTO Runtime Worker (C4).

Must be imported and called BEFORE any other application module so that
auto-instrumentation patches are applied at import time.

Provides:
  configure_telemetry(settings) — idempotent; call once at startup
  shutdown_telemetry(settings)  — flush + close providers at shutdown
  instrument_app(app)           — FastAPI OTel auto-instrumentation

Bootstrap order inside configure_telemetry():
  1. setup_logging   — structlog + inject_trace_context processor
  2. setup_tracing   — OTLPSpanExporter + BatchSpanProcessor
  3. setup_metrics   — OTLPMetricExporter + PrometheusInstrumentor
"""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import structlog
from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from opentelemetry.sdk.resources import Resource, SERVICE_NAME, SERVICE_VERSION
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor

if TYPE_CHECKING:
    from .config import Settings

# ── Module-level state (singleton pattern) ────────────────────────────────────
_tracer_provider: TracerProvider | None = None
_telemetry_configured: bool = False

AGENT_SPAN_ATTRS = {
    "agent.id": "agent_id",
    "agent.role": "agent_role",
    "llm.model": "model",
    "llm.prompt_tokens": "prompt_tokens",
    "llm.completion_tokens": "completion_tokens",
    "governance.token_budget": "token_budget",
    "governance.iterations": "iterations",
}


# ── Structlog processor: inject W3C trace context into every log record ───────

def inject_trace_context(
    logger: object,  # noqa: ARG001
    method: str,     # noqa: ARG001
    event_dict: dict,
) -> dict:
    """Inject OTel trace_id and span_id into structlog event dict.

    This links every structured log line to its OTel trace, enabling
    Grafana Loki <-> Tempo correlation without manual instrumentation.
    """
    span = trace.get_current_span()
    if span and span.is_recording():
        ctx = span.get_span_context()
        event_dict["trace_id"] = format(ctx.trace_id, "032x")
        event_dict["span_id"]  = format(ctx.span_id, "016x")
    return event_dict


# ── Logging ───────────────────────────────────────────────────────────────────

def setup_logging(settings: Settings) -> None:  # noqa: C901
    """Configure structlog with JSON renderer and OTel trace context injection."""
    shared_processors: list[structlog.types.Processor] = [
        structlog.contextvars.merge_contextvars,
        inject_trace_context,           # W3C trace_id / span_id in every log
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
    ]

    use_console = (
        settings.log_format.lower() == "console"
        or not settings.otel_enabled
    )
    renderer: structlog.types.Processor = (
        structlog.dev.ConsoleRenderer() if use_console
        else structlog.processors.JSONRenderer()
    )

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


# ── Tracing ───────────────────────────────────────────────────────────────────

def setup_tracing(settings: Settings) -> TracerProvider | None:
    """Initialize OTel TracerProvider with OTLP HTTP exporter.

    Returns the provider so the lifespan can flush and shut it down cleanly.
    Returns None when otel_enabled is False.
    """
    if not settings.otel_enabled:
        return None

    resource = Resource.create({
        SERVICE_NAME:    settings.otel_service_name,
        SERVICE_VERSION: settings.otel_service_version,
        "deployment.environment": settings.build_phase,
        "service.instance.id":    f"{settings.otel_service_name}-{settings.build_commit}",
    })

    exporter = OTLPSpanExporter(
        endpoint=f"{settings.otel_exporter_otlp_endpoint}/v1/traces",
    )

    provider = TracerProvider(resource=resource)
    provider.add_span_processor(BatchSpanProcessor(exporter))
    trace.set_tracer_provider(provider)
    return provider


# ── Metrics ───────────────────────────────────────────────────────────────────

def setup_metrics(settings: Settings) -> None:
    """Initialize OTel MeterProvider with OTLP HTTP exporter + Prometheus.

    Prometheus scraping is handled by the separate HTTP server started in
    main.py lifespan (prometheus_client.start_http_server(METRICS_PORT)).
    PrometheusInstrumentor instruments FastAPI request metrics.
    """
    if not settings.otel_enabled:
        return

    try:
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import (  # type: ignore[import-untyped]
            OTLPMetricExporter,
        )
        from opentelemetry.sdk.metrics import MeterProvider  # type: ignore[import-untyped]
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader  # type: ignore[import-untyped]
        from opentelemetry import metrics as otel_metrics  # type: ignore[import-untyped]
        from opentelemetry.sdk.resources import Resource as MetricResource  # type: ignore[import-untyped]

        resource = MetricResource.create({
            SERVICE_NAME:    settings.otel_service_name,
            SERVICE_VERSION: settings.otel_service_version,
        })

        metric_exporter = OTLPMetricExporter(
            endpoint=f"{settings.otel_exporter_otlp_endpoint}/v1/metrics",
        )
        reader = PeriodicExportingMetricReader(
            metric_exporter,
            export_interval_millis=60_000,  # 60s — matches Prometheus scrape interval
        )
        meter_provider = MeterProvider(resource=resource, metric_readers=[reader])
        otel_metrics.set_meter_provider(meter_provider)
    except ImportError:
        import structlog as _log
        _log.get_logger(__name__).warning(
            "telemetry.metrics_setup_skipped",
            reason="opentelemetry-sdk-metrics not installed",
        )
        return

    try:
        from prometheus_client import REGISTRY  # type: ignore[import-untyped]
        from opentelemetry.instrumentation.prometheus import PrometheusInstrumentor  # type: ignore[import-untyped]
        PrometheusInstrumentor().instrument(registry=REGISTRY)
    except ImportError:
        pass  # prometheus_client optional — metrics still exported via OTLP


# ── Public API ─────────────────────────────────────────────────────────────────

def configure_telemetry(settings: Settings) -> None:
    """Bootstrap telemetry. Idempotent — safe to call multiple times."""
    global _tracer_provider, _telemetry_configured  # noqa: PLW0603
    if _telemetry_configured:
        return

    setup_logging(settings)
    _tracer_provider = setup_tracing(settings)
    setup_metrics(settings)
    _telemetry_configured = True


def shutdown_telemetry(settings: Settings) -> None:  # noqa: ARG001
    """Flush and close OTel providers. Call in lifespan teardown."""
    global _tracer_provider, _telemetry_configured  # noqa: PLW0603
    if _tracer_provider is not None:
        _tracer_provider.force_flush(timeout_millis=5_000)
        _tracer_provider.shutdown()
        _tracer_provider = None
    _telemetry_configured = False


def instrument_app(app: object) -> None:
    """Apply FastAPI OTel auto-instrumentation. Must be called after all routers are mounted."""
    FastAPIInstrumentor.instrument_app(app)  # type: ignore[arg-type]
