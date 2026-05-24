import { pgTable, text, jsonb, integer, timestamp, index } from 'drizzle-orm/pg-core';

export const outboxPublishDlq = pgTable(
  'outbox_publish_dlq',
  {
    id: text('id').primaryKey(),
    outboxEventId: text('outbox_event_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    eventType: text('event_type').notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    errorMessage: text('error_message').notNull(),
    attempts: integer('attempts').notNull(),
    movedAt: timestamp('moved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantMovedAtIdx: index('idx_outbox_publish_dlq_tenant_moved_at').on(t.tenantId, t.movedAt),
  })
);
