// packages/database/src/schema/execution-steps.ts
// Per-step durable state within an execution run.
//
// Design invariants:
// - stepIndex is 0-based, monotonically increasing within an execution
// - (executionId, stepIndex) is unique and stable across retries
// - retryCount increments per step; the runtime worker manages retry logic
// - input/output are the raw payloads — never truncated, never summarized
// - durationMs is materialized on completion for fast analytics queries
//
// ADR: F0-004 (Durable Execution)

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';

// ─── ENUMS ────────────────────────────────────────────────────────────────────

export const stepStatusEnum = pgEnum('step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
]);

// Enum replaces the free-form text('step_type') from the original schema.
// Adding a new step type requires a migration — intentional, forces explicit
// contract evolution rather than silent string drift.
export const stepTypeEnum = pgEnum('step_type', [
  'llm_call',
  'tool_dispatch',
  'delegation',
  'reasoning',
  'memory_read',
  'memory_write',
  'embedding',
  'checkpoint',
  'approval_gate',
]);

// ─── TABLE ────────────────────────────────────────────────────────────────────

export const executionSteps = pgTable(
  'execution_steps',
  {
    id:           text('id').primaryKey(),    // UUID v7
    executionId:  text('execution_id')
                    .notNull()
                    .references(() => executions.id, { onDelete: 'cascade' }),
    stepIndex:    integer('step_index').notNull(),
    stepType:     stepTypeEnum('step_type').notNull(),
    status:       stepStatusEnum('status').notNull().default('pending'),

    // ── Idempotency ───────────────────────────────────────────────────────────
    // TASK 5 — step-level dedup. Prevents double-execution of side-effectful
    // steps (LLM calls, tool dispatches) on retry.
    idempotencyKey: text('idempotency_key'),

    // ── Payloads ──────────────────────────────────────────────────────────────
    input:  jsonb('input'),   // step input (task fragment, prompt, tool args)
    output: jsonb('output'),  // step output (LLM response, tool result)
    error:  jsonb('error'),   // { code, message, stack?, retryable: boolean }

    // ── Retry tracking ────────────────────────────────────────────────────────
    retryCount:  integer('retry_count').notNull().default(0),
    lastError:   jsonb('last_error'),  // preserved for DLQ inspection

    // ── Observability ─────────────────────────────────────────────────────────
    traceId: text('trace_id'),  // W3C traceparent — propagated from parent execution
    spanId:  text('span_id'),   // OTel span for this step

    // ── Performance ───────────────────────────────────────────────────────────
    // Materialized on step completion. Avoids recomputing in analytics queries.
    durationMs: integer('duration_ms'),

    // ── Timestamps ───────────────────────────────────────────────────────────
    startedAt:   timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt:   timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    executionIdx:  index('execution_steps_execution_id_idx').on(t.executionId),
    statusIdx:     index('execution_steps_status_idx').on(t.status),
    // Composite: fast lookup of "step N in execution X"
    stepIndexIdx:  uniqueIndex('execution_steps_execution_step_uidx').on(t.executionId, t.stepIndex),
    traceIdx:      index('execution_steps_trace_id_idx').on(t.traceId),
    typeIdx:       index('execution_steps_step_type_idx').on(t.stepType),
  }),
);

export type ExecutionStep    = typeof executionSteps.$inferSelect;
export type NewExecutionStep = typeof executionSteps.$inferInsert;
