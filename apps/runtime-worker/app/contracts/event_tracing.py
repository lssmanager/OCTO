from __future__ import annotations

from opentelemetry import context as otel_context, propagation, trace
from opentelemetry.trace import SpanKind

from .events import EventEnvelope


def build_traceparent(trace_id: str, span_id: str) -> str:
    return f"00-{trace_id}-{span_id}-01"


def extract_event_parent_context(event: EventEnvelope):
    carrier = {"traceparent": build_traceparent(event.trace_id, event.span_id)}
    return propagation.extract(carrier=carrier, context=otel_context.get_current())


def start_process_event_span(event: EventEnvelope):
    tracer = trace.get_tracer("octo.events")
    parent = extract_event_parent_context(event)
    return tracer.start_span(
        "process_event",
        context=parent,
        kind=SpanKind.CONSUMER,
        attributes={
            "tenantId": event.tenant_id,
            "aggregateId": event.aggregate_id,
            "eventType": event.event_type,
            "eventId": event.event_id,
            "sequence": event.sequence,
        },
    )
