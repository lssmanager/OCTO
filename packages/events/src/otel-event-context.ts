import { context, propagation, trace, SpanKind } from '@opentelemetry/api';
import type { EventEnvelope } from '@octo/contracts';

export function buildTraceparent(traceId: string, spanId: string): string | null {
  // Validate traceId: must be exactly 32 lowercase hex characters
  if (traceId.length !== 32 || !/^[0-9a-f]{32}$/.test(traceId)) {
    return null;
  }
  // Validate spanId: must be exactly 16 lowercase hex characters
  if (spanId.length !== 16 || !/^[0-9a-f]{16}$/.test(spanId)) {
    return null;
  }
  return `00-${traceId}-${spanId}-01`;
}

export function extractEventParentContext(event: Pick<EventEnvelope, 'traceId'|'spanId'>) {
  const traceparent = buildTraceparent(event.traceId, event.spanId);
  if (!traceparent) {
    return context.active();
  }
  return propagation.extract(context.active(), { traceparent });
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

export const buildTraceParentFromEvent = (event: EventEnvelope): string | null => buildTraceparent(event.traceId, event.spanId);
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
