// packages/database/src/schema/execution-dlq.ts
// TASK 6 — Dead-letter queue table.
//
// When a job exhausts all retries (max_attempts reached), the
// runtime-worker moves it here before removing it from BullMQ.
// This ensures failed jobs are ALWAYS inspectable after the queue
// TTL expires, which is critical for debugging and replay.
//
// A job in the DLQ is NOT retried automatically.
// Replay must be triggered explicitly via API:
//   POST /executions/:id/replay
//
// failureContext preserves the full BullMQ job data + error chain,
// so the replay can reconstruct the exact execution state.
//
// quarantine: if true, the job is flagged for manual review and
// will not be replayed even if replay is triggered globally.
// Used for poison messages that cause worker panics.
//
// ADR: F0-006 (Retry + DLQ Strategy)

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';

export const dlqReasonEnum = pgEnum('dlq_reason', [
  'max_retries_exceeded', // exponential backoff exhausted
  'non_retryable_error', // error.retryable === false
  'governance_limit', // token/cost/recursion budget exceeded
  'timeout', // step or execution timeout
  'poison_message', // caused worker panic / unhandled crash
  'reclaim_max_attempts_exceeded', // F1 reclaim exhausted ownership attempts
  'stale_ownership', // stale runtime/worker attempted to mutate after losing lease
  'runtime_non_retryable', // runtime returned a stable non-retryable failure
  'manual', // operator-triggered via API
]);

export const executionDlq = pgTable(
  'execution_dlq',
  {
    id: text('id').primaryKey(), // UUID v7
    executionId: text('execution_id').references(() => executions.id), // nullable — job may not have an execution row
    tenantId: text('tenant_id').notNull(),

    // ── Failure context ───────────────────────────────────────────────────────
    reason: dlqReasonEnum('reason').notNull(),
    attemptsMade: integer('attempts_made').notNull(),
    lastError: jsonb('last_error').notNull(), // { message, code, stack, retryable }
    errorChain: jsonb('error_chain'), // full retry history
    failureContext: jsonb('failure_context').notNull(), // original OctoJobPayload + BullMQ metadata
    firstFailureAt: timestamp('first_failure_at'),
    lastFailureAt: timestamp('last_failure_at'),
    retryAfter: timestamp('retry_after'),
    payloadJson: jsonb('payload_json'),

    // ── Queue metadata ────────────────────────────────────────────────────────
    queueName: text('queue_name').notNull(),
    queueJobId: text('queue_job_id').notNull(),
    traceId: text('trace_id'),
    runId: text('run_id'),

    // ── Inspection / replay ───────────────────────────────────────────────────
    // quarantine=true: skip during global replay, requires manual resolution
    quarantine: boolean('quarantine').notNull().default(false),
    notes: text('notes'), // operator notes added via API
    replayedAt: timestamp('replayed_at'), // set when replay is triggered
    replayRunId: text('replay_run_id'), // new execution ID from replay
    resolvedAt: timestamp('resolved_at'), // set when marked resolved
    resolvedBy: text('resolved_by'), // user ID or 'system'

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('dlq_tenant_id_idx').on(t.tenantId),
    executionIdx: index('dlq_execution_id_idx').on(t.executionId),
    reasonIdx: index('dlq_reason_idx').on(t.reason),
    quarantineIdx: index('dlq_quarantine_idx').on(t.quarantine),
    traceIdx: index('dlq_trace_id_idx').on(t.traceId),
    createdIdx: index('dlq_created_at_idx').on(t.createdAt),
  })
);

export type ExecutionDlqEntry = typeof executionDlq.$inferSelect;
export type NewExecutionDlqEntry = typeof executionDlq.$inferInsert;
