import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { outboxEvents } from './schema/outbox-events';

export type OutboxSource = 'api' | 'scheduler-worker' | 'runtime-worker' | 'reclaimer-worker' | 'outbox-publisher-worker' | string;

export type InsertOutboxEventInput = {
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  payloadJson: Record<string, unknown>;
  traceId?: string | null;
  spanId?: string | null;
  source: OutboxSource;
  schemaVersion?: '1.0';
  occurredAt?: Date;
};

export async function nextOutboxSequence(
  tx: any,
  tenantId: string,
  aggregateType: string,
  aggregateId: string
): Promise<number> {
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${tenantId}:${aggregateType}:${aggregateId}`}))`);
  const row = await tx.execute(sql`
    SELECT COALESCE(MAX(sequence), 0) + 1 AS next
    FROM outbox_events
    WHERE tenant_id=${tenantId}
      AND aggregate_type=${aggregateType}
      AND aggregate_id=${aggregateId}
    FOR UPDATE
  `);
  return Number((row as any).rows?.[0]?.next ?? 1);
}

export function normalizeOutboxPayload(input: InsertOutboxEventInput): Record<string, unknown> {
  const existingMeta = (input.payloadJson['_meta'] ?? {}) as Record<string, unknown>;
  const occurredAt = input.occurredAt ?? new Date();
  return {
    ...input.payloadJson,
    _meta: {
      ...existingMeta,
      traceId: input.traceId ?? existingMeta['traceId'] ?? 'unknown-trace',
      spanId: input.spanId ?? existingMeta['spanId'] ?? 'unknown-span',
      occurredAt: existingMeta['occurredAt'] ?? occurredAt.toISOString(),
      schemaVersion: input.schemaVersion ?? '1.0',
      source: input.source,
      service: input.source,
    },
  };
}

export async function insertOutboxEvent(tx: any, input: InsertOutboxEventInput): Promise<{ id: string; sequence: number }> {
  const sequence = await nextOutboxSequence(tx, input.tenantId, input.aggregateType, input.aggregateId);
  const id = randomUUID();
  await tx.insert(outboxEvents).values({
    id,
    tenantId: input.tenantId,
    aggregateType: input.aggregateType,
    aggregateId: input.aggregateId,
    eventType: input.eventType,
    sequence,
    payloadJson: normalizeOutboxPayload(input),
  });
  return { id, sequence };
}
