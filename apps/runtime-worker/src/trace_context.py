"""
apps/runtime-worker/src/trace_context.py
H7 -- Trace Continuity: Python runtime-worker side.

Extracts the W3C traceparent/tracestate from the BullMQ job payload
and resumes the distributed trace started in the NestJS control plane.

WITHOUT THIS:
  Python span is a new root trace. Grafana shows two disconnected waterfalls.

WITH THIS:
  Python span is a child of the NestJS enqueue span.
  Single trace_id end-to-end: HTTP -> BullMQ -> Python -> tools.

USAGE:
  from trace_context import resume_trace_from_job

  async def process_job(job_data: dict):
      ctx = resume_trace_from_job(job_data)
      with tracer.start_as_current_span("runtime.execute", context=ctx) as span:
          span.set_attribute("execution.id", job_data["executionId"])
          ...
"""

from opentelemetry import propagate, trace
from opentelemetry.context import Context
from opentelemetry.trace.propagation.tracecontext import TraceContextTextMapPropagator

_propagator = TraceContextTextMapPropagator()


def resume_trace_from_job(job_data: dict) -> Context:
    """
    Extracts W3C trace context from BullMQ job payload.

    Args:
        job_data: The BullMQ job's data dict.
                  Accepts canonical traceparent/tracestate keys and keeps the
                  legacy underscored aliases as a backward-compatible fallback.

    Returns:
        An OTel Context with the remote span set as parent.
        Falls back to empty context if no carrier present (tests / cold start).
    """
    carrier: dict[str, str] = {}

    traceparent = job_data.get("traceparent") or job_data.get("_traceparent")
    tracestate = job_data.get("tracestate") or job_data.get("_tracestate")

    if traceparent:
        carrier["traceparent"] = traceparent
    if tracestate:
        carrier["tracestate"] = tracestate

    if not carrier:
        # No trace context in payload -- start a new root trace.
        # This is valid for locally-triggered jobs and tests.
        return Context()

    return propagate.extract(carrier)


def get_trace_id_hex(ctx: Context) -> str | None:
    """Returns the hex trace_id from the context, or None."""
    span = trace.get_current_span(ctx)
    sc = span.get_span_context()
    if sc and sc.is_valid:
        return format(sc.trace_id, "032x")
    return None
