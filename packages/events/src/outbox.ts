export interface OutboxInsertTransaction {
  insert: (table: unknown) => {
    values: (record: Record<string, unknown>) => Promise<unknown>;
  };
}

export interface InsertOutboxEventParams {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  sequence: number;
  payload: Record<string, unknown>;
  traceId?: string;
  spanId?: string;
  occurredAt?: string;
  eventId?: string;
}

export async function insertOutboxEvent(
  tx: OutboxInsertTransaction,
  outboxTable: unknown,
  params: InsertOutboxEventParams
): Promise<string> {
  const eventId = params.eventId ?? crypto.randomUUID();
  const occurredAt = params.occurredAt ?? new Date().toISOString();

  await tx.insert(outboxTable).values({
    id: eventId,
    tenantId: params.tenantId,
    aggregateType: params.aggregateType,
    aggregateId: params.aggregateId,
    eventType: params.eventType,
    sequence: params.sequence,
    payloadJson: {
      ...params.payload,
      _meta: {
        traceId: params.traceId ?? null,
        spanId: params.spanId ?? null,
        occurredAt,
      },
    },
    publishedAt: null,
    publishAttempts: 0,
    lastError: null,
  });

  return eventId;
}
