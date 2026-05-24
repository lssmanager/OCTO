import { pgTable, text, timestamp, jsonb, bigint, integer, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const outboxEvents = pgTable(
  'outbox_events',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    aggregateType: text('aggregate_type').notNull(),
    aggregateId: text('aggregate_id').notNull(),
    eventType: text('event_type').notNull(),
    sequence: bigint('sequence', { mode: 'number' }).notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishAttempts: integer('publish_attempts').notNull().default(0),
    lastError: text('last_error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    unpublishedIdx: index('idx_outbox_unpublished')
      .on(t.publishedAt, t.createdAt)
      .where(sql`published_at IS NULL`),
    tenantUnpublishedIdx: index('idx_outbox_tenant_unpublished')
      .on(t.tenantId, t.createdAt)
      .where(sql`published_at IS NULL`),
    tenantAggregateSequenceUniqueIdx: uniqueIndex('idx_outbox_aggregate_sequence').on(
      t.tenantId,
      t.aggregateType,
      t.aggregateId,
      t.sequence
    ),
  })
);

export type OutboxEvent = typeof outboxEvents.$inferSelect;
export type NewOutboxEvent = typeof outboxEvents.$inferInsert;
