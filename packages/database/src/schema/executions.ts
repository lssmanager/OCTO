import { pgTable, text, timestamp, jsonb, pgEnum } from 'drizzle-orm/pg-core';

export const executionStatusEnum = pgEnum('execution_status', [
  'pending',
  'queued',
  'running',
  'waiting_approval',
  'paused',
  'completed',
  'failed',
  'cancelled',
  'retrying',
]);

export const executionsTable = pgTable('executions', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  agentId: text('agent_id').notNull(),
  status: executionStatusEnum('status').notNull().default('pending'),
  input: jsonb('input'),
  output: jsonb('output'),
  error: text('error'),
  traceId: text('trace_id').notNull(),
  startedAt: timestamp('started_at').notNull().defaultNow(),
  completedAt: timestamp('completed_at'),
  checkpointAt: timestamp('checkpoint_at'),
});
