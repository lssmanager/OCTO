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
  } }, parent, async (span: import('@opentelemetry/api').Span) => {
    try { return await fn(); } finally { span.end(); }
  });
}

export const buildTraceParentFromEvent = (event: EventEnvelope) => buildTraceparent(event.traceId, event.spanId);
export function startEventConsumerSpan(params: { tracer: ReturnType<typeof trace.getTracer>; event: EventEnvelope; spanName?: string; }) {
  const parent = extractEventParentContext(params.event);
  return params.tracer.startSpan(params.spanName ?? 'process_event', { kind: SpanKind.CONSUMER, attributes: {
    'octo.event_id': params.event.eventId,
    'octo.event_type': params.event.eventType,
    'octo.tenant_id': params.event.tenantId,
    'octo.aggregate_type': params.event.aggregateType,
    'octo.aggregate_id': params.event.aggregateId,
    'octo.sequence': params.event.sequence,
    'octo.schema_version': params.event.schemaVersion,
    'messaging.system': 'redis',
    'messaging.destination.name': 'octo.events',
    'messaging.operation': 'process',
  } }, parent);
}
