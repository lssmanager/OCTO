import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';

// ─────────────────────────────────────────────────────────────────
// execution_steps — granular per-step state within an execution
//
// Each row represents one node in the execution DAG: a reasoning
// step, an LLM call, a tool dispatch, a delegation, etc.
// stepIndex is 0-based and monotonically increasing within an execution.
// The (executionId, stepIndex) pair is unique and stable across retries.
// retryCount starts at 0; the runtime increments it on each retry.
// ─────────────────────────────────────────────────────────────────

export const stepStatusEnum = pgEnum('step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

export const executionSteps = pgTable(
  'execution_steps',
  {
    id: text('id').primaryKey(), // UUID v7
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    stepType: text('step_type').notNull(), // 'llm_call' | 'tool_dispatch' | 'delegation' | 'reasoning' | 'memory_read' | 'memory_write'
    status: stepStatusEnum('status').notNull().default('pending'),
    input: jsonb('input'),  // step input payload (task fragment, prompt, etc.)
    output: jsonb('output'), // step output payload (LLM response, tool result, etc.)
    error: jsonb('error'),   // { code, message, stack?, retryable }
    traceId: text('trace_id'),   // OTEL trace_id — propagated from parent execution
    spanId: text('span_id'),     // OTEL span_id for this step
    retryCount: integer('retry_count').notNull().default(0),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    executionIdx:  index('execution_steps_execution_id_idx').on(t.executionId),
    statusIdx:     index('execution_steps_status_idx').on(t.status),
    stepIndexIdx:  index('execution_steps_step_index_idx').on(t.executionId, t.stepIndex),
    traceIdx:      index('execution_steps_trace_id_idx').on(t.traceId),
  }),
);

export type ExecutionStep    = typeof executionSteps.$inferSelect;
export type NewExecutionStep = typeof executionSteps.$inferInsert;
