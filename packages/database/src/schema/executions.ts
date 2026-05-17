import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const executionStatusEnum = pgEnum('execution_status', [
  'pending',
  'queued',
  'running',
  'paused',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

export const executions = pgTable(
  'executions',
  {
    id: text('id').primaryKey(), // UUID v7
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    status: executionStatusEnum('status').notNull().default('pending'),
    task: jsonb('task').notNull(), // TaskDefinition
    governance: jsonb('governance').notNull(), // GovernancePolicy — Paperclip pattern
    result: jsonb('result'), // TaskResult | null
    error: jsonb('error'), // ExecutionError | null
    traceId: text('trace_id').notNull(), // OTEL trace_id
    runId: text('run_id').notNull(),
    tokenUsage: jsonb('token_usage'), // TokenUsage | null
    checkpoint: jsonb('checkpoint'), // LangGraph pause/resume state (used in F2)
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index('executions_agent_id_idx').on(t.agentId),
    statusIdx: index('executions_status_idx').on(t.status),
    traceIdx: index('executions_trace_id_idx').on(t.traceId),
    createdIdx: index('executions_created_at_idx').on(t.createdAt),
  }),
);

export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
