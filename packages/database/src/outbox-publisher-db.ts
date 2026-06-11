import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db, withTenantTx } from './client';
import { outboxEvents, outboxPublishDlq } from './schema';

export interface PostgresOutboxRow {
  id: string;
  tenantId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  sequence: number;
  payloadJson: Record<string, unknown>;
  publishAttempts: number;
  occurredAt?: string;
  createdAt?: Date;
}

export interface PostgresOutboxPublisherDb {
  tryAdvisoryLock: (id: number) => Promise<boolean>;
  fetchUnpublished: (limit: number) => Promise<PostgresOutboxRow[]>;
  markPublished: (id: string, tenantId?: string) => Promise<void>;
  recordFailure: (id: string, error: string, tenantId?: string) => Promise<number>;
  moveToDlq: (row: PostgresOutboxRow, error: string, attempts: number) => Promise<void>;
  pendingCount: () => Promise<number>;
  oldestUnpublishedAgeMs?: () => Promise<number>;
  dlqTotal?: () => Promise<number>;
}

function mapOutboxRow(row: any): PostgresOutboxRow {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    aggregateType: row.aggregate_type,
    aggregateId: row.aggregate_id,
    eventType: row.event_type,
    sequence: Number(row.sequence),
    payloadJson: row.payload_json ?? {},
    publishAttempts: Number(row.publish_attempts ?? 0),
    createdAt: row.created_at ? new Date(row.created_at) : undefined,
  };
}

export function createPostgresOutboxPublisherDb(): PostgresOutboxPublisherDb {
  return {
    async tryAdvisoryLock(id: number): Promise<boolean> {
      const result = await db.execute(sql`SELECT pg_try_advisory_lock(${id}) AS locked`);
      return Boolean((result as any).rows?.[0]?.locked);
    },

    async fetchUnpublished(limit: number): Promise<PostgresOutboxRow[]> {
      const rows = await db.transaction(async (tx) => {
        const result = await tx.execute(sql`
          SELECT id, tenant_id, aggregate_type, aggregate_id, event_type, sequence, payload_json, publish_attempts, created_at
          FROM outbox_events
          WHERE published_at IS NULL
            AND dead_lettered_at IS NULL
          ORDER BY tenant_id, aggregate_type, aggregate_id, sequence, created_at
          LIMIT ${limit}
          FOR UPDATE SKIP LOCKED
        `);
        return (result as any).rows ?? [];
      });
      return rows.map(mapOutboxRow);
    },

    async markPublished(id: string, tenantId?: string): Promise<void> {
      if (!tenantId) throw new Error('tenantId is required to mark outbox events as published');
      await withTenantTx(tenantId, async (tx) => {
        await tx
          .update(outboxEvents)
          .set({ publishedAt: new Date(), lastError: null })
          .where(
            sql`${outboxEvents.id} = ${id} AND ${outboxEvents.tenantId} = ${tenantId} AND ${outboxEvents.deadLetteredAt} IS NULL`
          );
      });
    },

    async recordFailure(id: string, error: string, tenantId?: string): Promise<number> {
      if (!tenantId) throw new Error('tenantId is required to record outbox publish failures');
      return withTenantTx(tenantId, async (tx) => {
        const result = await tx.execute(sql`
          UPDATE outbox_events
          SET publish_attempts = publish_attempts + 1,
              last_error = ${error}
          WHERE id = ${id}
            AND tenant_id = ${tenantId}
            AND published_at IS NULL
            AND dead_lettered_at IS NULL
          RETURNING publish_attempts
        `);
        return Number((result as any).rows?.[0]?.publish_attempts ?? 0);
      });
    },

    async moveToDlq(row: PostgresOutboxRow, error: string, attempts: number): Promise<void> {
      await withTenantTx(row.tenantId, async (tx) => {
        await tx.insert(outboxPublishDlq).values({
          id: randomUUID(),
          outboxEventId: row.id,
          tenantId: row.tenantId,
          eventType: row.eventType,
          payloadJson: row.payloadJson,
          errorMessage: error,
          attempts,
        });
        await tx
          .update(outboxEvents)
          .set({ deadLetteredAt: new Date(), lastError: error, publishAttempts: attempts })
          .where(
            sql`${outboxEvents.id} = ${row.id} AND ${outboxEvents.tenantId} = ${row.tenantId} AND ${outboxEvents.publishedAt} IS NULL`
          );
      });
    },

    async pendingCount(): Promise<number> {
      const result = await db.execute(
        sql`SELECT COUNT(*)::int AS count FROM outbox_events WHERE published_at IS NULL AND dead_lettered_at IS NULL`
      );
      return Number((result as any).rows?.[0]?.count ?? 0);
    },

    async oldestUnpublishedAgeMs(): Promise<number> {
      const result = await db.execute(sql`
        SELECT COALESCE(EXTRACT(EPOCH FROM (now() - MIN(created_at))) * 1000, 0)::bigint AS age_ms
        FROM outbox_events
        WHERE published_at IS NULL AND dead_lettered_at IS NULL
      `);
      return Number((result as any).rows?.[0]?.age_ms ?? 0);
    },

    async dlqTotal(): Promise<number> {
      const result = await db.execute(sql`SELECT COUNT(*)::int AS count FROM outbox_publish_dlq`);
      return Number((result as any).rows?.[0]?.count ?? 0);
    },
  };
}
