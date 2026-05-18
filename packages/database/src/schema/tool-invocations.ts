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
import { executionSteps } from './execution-steps';

// ─────────────────────────────────────────────────────────────────
// tool_invocations — immutable audit trail of every tool call
//
// Every tool call made by any worker is recorded here before
// the call is dispatched and updated when it completes or fails.
// This table is append-only in normal operation — rows are never
// updated after status reaches 'completed' or 'failed'.
//
// toolName:   canonical tool identifier (e.g. 'web_search', 'code_exec')
// input:      exact payload sent to the tool
// output:     exact payload received from the tool
// durationMs: wall-clock time from invocation to response
// tokenUsage: if the tool is an LLM call, token counts
// error:      { code, message, retryable } if status === 'failed'
// spanId:     OTEL span_id for this tool invocation
// ─────────────────────────────────────────────────────────────────

export const toolInvocationStatusEnum = pgEnum('tool_invocation_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
]);

export const toolInvocations = pgTable(
  'tool_invocations',
  {
    id: text('id').primaryKey(), // UUID v7
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    stepId: text('step_id')
      .references(() => executionSteps.id, { onDelete: 'set null' }),
    toolName: text('tool_name').notNull(),
    toolVersion: text('tool_version'), // semver — enables audit of tool regressions
    status: toolInvocationStatusEnum('status').notNull().default('pending'),
    input: jsonb('input').notNull(),
    output: jsonb('output'),
    error: jsonb('error'),
    durationMs: integer('duration_ms'),
    tokenUsage: jsonb('token_usage'), // { prompt, completion, total } | null
    spanId: text('span_id'),          // OTEL span_id
    traceId: text('trace_id'),        // OTEL trace_id
    invokedAt: timestamp('invoked_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (t) => ({
    executionIdx:  index('tool_invocations_execution_id_idx').on(t.executionId),
    stepIdx:       index('tool_invocations_step_id_idx').on(t.stepId),
    toolNameIdx:   index('tool_invocations_tool_name_idx').on(t.toolName),
    statusIdx:     index('tool_invocations_status_idx').on(t.status),
    invokedAtIdx:  index('tool_invocations_invoked_at_idx').on(t.invokedAt),
    traceIdx:      index('tool_invocations_trace_id_idx').on(t.traceId),
  }),
);

export type ToolInvocation    = typeof toolInvocations.$inferSelect;
export type NewToolInvocation = typeof toolInvocations.$inferInsert;
