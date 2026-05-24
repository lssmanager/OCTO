import { EventEnvelopeSchema, type EventEnvelope } from '@octo/contracts';

export function redisFieldsToEventEnvelope(fields: Record<string, string>): EventEnvelope {
  const aggregateParts = fields.aggregate?.split(':') ?? [];
  const aggregateType = fields.aggregate_type ?? aggregateParts[0] ?? '';
  const aggregateId = fields.aggregate_id ?? aggregateParts.slice(1).join(':');

  return EventEnvelopeSchema.parse({
    eventId: fields.id,
    eventType: fields.type,
    tenantId: fields.tenant_id,
    aggregateType,
    aggregateId,
    sequence: Number(fields.sequence),
    traceId: fields.trace_id,
    spanId: fields.span_id,
    occurredAt: fields.occurred_at,
    schemaVersion: fields.schema_version ?? '1.0',
    payload: JSON.parse(fields.payload),
  });
}
