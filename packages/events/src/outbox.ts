import { EventEnvelopeSchema, validateEventPayload, type EventEnvelope, type F1EventType } from '@octo/contracts';

export interface OutboxInsertTransaction {
  insert: (table: unknown) => {
    values: (record: Record<string, unknown>) => Promise<unknown>;
  };
}

export async function insertOutboxEvent(
  tx: OutboxInsertTransaction,
  outboxTable: unknown,
  event: EventEnvelope
): Promise<string> {
  const parsed = EventEnvelopeSchema.parse(event);
  validateEventPayload(parsed.eventType as F1EventType, parsed.payload);

  await tx.insert(outboxTable).values({
    id: parsed.eventId,
    tenantId: parsed.tenantId,
    aggregateType: parsed.aggregateType,
    aggregateId: parsed.aggregateId,
    eventType: parsed.eventType,
    sequence: parsed.sequence,
    payloadJson: {
      ...parsed.payload,
      _meta: {
        traceId: parsed.traceId,
        spanId: parsed.spanId,
        occurredAt: parsed.occurredAt,
        schemaVersion: parsed.schemaVersion,
      },
    },
    publishedAt: null,
    publishAttempts: 0,
    lastError: null,
  });

  return parsed.eventId;
}
