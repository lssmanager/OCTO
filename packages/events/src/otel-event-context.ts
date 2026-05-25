import { context, propagation, trace, SpanKind } from '@opentelemetry/api';
import type { EventEnvelope } from '@octo/contracts';

export function buildTraceparent(traceId: string, spanId: string): string {
  return `00-${traceId}-${spanId}-01`;
}

export function extractEventParentContext(event: Pick<EventEnvelope, 'traceId'|'spanId'>) {
  return propagation.extract(context.active(), { traceparent: buildTraceparent(event.traceId, event.spanId) });
}

export async function withProcessEventSpan<T>(event: EventEnvelope, fn: () => Promise<T>): Promise<T> {
  const tracer = trace.getTracer('octo.events');
  const parent = extractEventParentContext(event);
  return tracer.startActiveSpan('process_event', { kind: SpanKind.CONSUMER, attributes: {
    tenantId: event.tenantId,
    aggregateId: event.aggregateId,
    eventType: event.eventType,
    eventId: event.eventId,
    sequence: event.sequence,
  } }, parent, async (span) => {
    try { return await fn(); } finally { span.end(); }
  });
}
