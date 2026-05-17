import { pgTable, text, timestamp, jsonb } from 'drizzle-orm/pg-core';

export const executionEventsTable = pgTable('execution_events', {
  id: text('id').primaryKey(),
  type: text('type').notNull(),
  traceId: text('trace_id').notNull(),
  executionId: text('execution_id').notNull(),
  agentId: text('agent_id').notNull(),
  payload: jsonb('payload'),
  occurredAt: timestamp('occurred_at').notNull().defaultNow(),
});
