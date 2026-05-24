import type { EventEnvelope } from '@octo/contracts';

export function eventEnvelopeToRedisFields(event: EventEnvelope): string[] {
  return [
    'id', event.eventId,
    'type', event.eventType,
    'tenant_id', event.tenantId,
    'aggregate', `${event.aggregateType}:${event.aggregateId}`,
    'aggregate_type', event.aggregateType,
    'aggregate_id', event.aggregateId,
    'sequence', String(event.sequence),
    'trace_id', event.traceId,
    'span_id', event.spanId,
    'occurred_at', event.occurredAt,
    'schema_version', event.schemaVersion,
    'payload', JSON.stringify(event.payload),
  ];
}
