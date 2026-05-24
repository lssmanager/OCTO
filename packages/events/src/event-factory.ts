import { EventEnvelopeSchema, type EventEnvelope, type F1EventType, validateEventPayload } from '@octo/contracts';

export function createEventEnvelope<TPayload extends Record<string, unknown>>(params: {
  eventType: F1EventType;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  sequence: number;
  traceId: string;
  spanId: string;
  payload: TPayload;
  occurredAt?: string;
  eventId?: string;
}): EventEnvelope {
  const payload = validateEventPayload(params.eventType, params.payload);
  return EventEnvelopeSchema.parse({
    eventId: params.eventId ?? crypto.randomUUID(),
    eventType: params.eventType,
    tenantId: params.tenantId,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    sequence: params.sequence,
    traceId: params.traceId,
    spanId: params.spanId,
    occurredAt: params.occurredAt ?? new Date().toISOString(),
    schemaVersion: '1.0',
    payload,
  });
}
