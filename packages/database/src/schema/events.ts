import {
  pgTable,
  text,
  timestamp,
  jsonb,
  bigint,
  index,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';

// append-only event log — bigint PK for sequential order and efficient range scans
export const executionEvents = pgTable(
  'execution_events',
  {
    id: bigint('id', { mode: 'bigint' })
      .primaryKey()
      .generatedAlwaysAsIdentity(),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id),
    type: text('type').notNull(), // OctoEventType
    payload: jsonb('payload').notNull(),
    metadata: jsonb('metadata').notNull(), // { traceId, agentId, runId }
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    executionIdx: index('events_execution_id_idx').on(t.executionId),
    typeIdx: index('events_type_idx').on(t.type),
    createdIdx: index('events_created_at_idx').on(t.createdAt),
  }),
);

export type ExecutionEvent = typeof executionEvents.$inferSelect;
export type NewExecutionEvent = typeof executionEvents.$inferInsert;
