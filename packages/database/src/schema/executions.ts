// packages/database/src/schema/executions.ts
// System of record for every execution run.
// PostgreSQL IS the source of truth — Redis is transient queue only.
//
// ADR: F0-004 (Durable Execution), F0-015 (Multi-Tenancy from day one)

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
import { agents } from './agents';

// ─── STATUS ENUM ──────────────────────────────────────────────────────────────
// Full F0 state machine.
// Transitions are validated in packages/contracts/src/execution.ts.
// Invalid transitions are rejected at the application layer — the DB
// stores the current state, not the transition history (that's execution_events).

export const executionStatusEnum = pgEnum('execution_status', [
  'pending',          // created, not yet enqueued
  'queued',           // BullMQ job created, not yet picked up
  'running',          // worker actively processing
  'waiting_tool',     // blocked on external tool response
  'waiting_human',    // blocked on human approval (HITL gate)
  'retrying',         // transient failure, exponential backoff in progress
  'suspended',        // explicit pause — can be resumed by API
  'completed',        // terminal success
  'failed',           // terminal failure (max retries exceeded or non-retryable)
  'cancelled',        // terminated by user or governance policy
]);

// ─── TRIGGER SOURCE ENUM ─────────────────────────────────────────────────────

export const triggerSourceEnum = pgEnum('trigger_source', [
  'api',          // direct REST call
  'schedule',     // scheduler-worker cron trigger
  'channel',      // inbound channel message (Discord, Telegram, WhatsApp)
  'delegation',   // spawned by parent agent (Hermes pattern)
  'replay',       // manual replay of a previous execution
]);

// ─── TABLE ────────────────────────────────────────────────────────────────────

export const executions = pgTable(
  'executions',
  {
    // ── Identity ──────────────────────────────────────────────────────────────
    id:             text('id').primaryKey(),               // UUID v7 — time-ordered
    tenantId:       text('tenant_id').notNull(),           // mandatory from day one
    agentId:        text('agent_id')
                      .notNull()
                      .references(() => agents.id),

    // ── Deduplication ─────────────────────────────────────────────────────────
    // TASK 5 — idempotency. Callers provide a stable key; repeated submissions
    // with the same key return the existing execution instead of creating a new one.
    // Null for fire-and-forget executions that don't require dedup.
    idempotencyKey: text('idempotency_key'),

    // ── Trigger context ───────────────────────────────────────────────────────
    triggerSource:  triggerSourceEnum('trigger_source').notNull().default('api'),
    // Channel message ID or schedule job ID that triggered this execution.
    // Used to correlate inbound events back to their source.
    triggerRef:     text('trigger_ref'),

    // ── State ─────────────────────────────────────────────────────────────────
    status:         executionStatusEnum('status').notNull().default('pending'),
    // execution-level retry counter (separate from step retries)
    attempt:        integer('attempt').notNull().default(0),

    // ── Queue binding ─────────────────────────────────────────────────────────
    // BullMQ job ID — correlates Postgres row with queue job for debugging.
    // Null until the execution is enqueued.
    queueJobId:     text('queue_job_id'),
    // Worker instance that owns this execution. Null until picked up.
    // Used for worker-specific health monitoring and drain operations.
    workerId:       text('worker_id'),

    // ── Execution input / output ──────────────────────────────────────────────
    task:           jsonb('task').notNull(),        // TaskDefinition
    governance:     jsonb('governance').notNull(),  // GovernancePolicy (Paperclip)
    result:         jsonb('result'),                // TaskResult | null
    error:          jsonb('error'),                 // ExecutionError | null

    // ── Observability correlation ─────────────────────────────────────────────
    // traceId carries the W3C traceparent root. Propagated to all steps and events.
    traceId:        text('trace_id').notNull(),
    runId:          text('run_id').notNull(),

    // ── Resource tracking ─────────────────────────────────────────────────────
    tokenUsage:     jsonb('token_usage'),    // { prompt, completion, total }
    costUsd:        jsonb('cost_usd'),       // { amount, currency } — for budget tracking

    // ── Resume state ──────────────────────────────────────────────────────────
    // Pointer to the latest checkpoint row in execution_checkpoints.
    // Denormalized for fast resume without a subquery.
    lastCheckpointId: text('last_checkpoint_id'),

    // ── Timestamps ───────────────────────────────────────────────────────────
    startedAt:      timestamp('started_at'),
    completedAt:    timestamp('completed_at'),
    createdAt:      timestamp('created_at').notNull().defaultNow(),
    updatedAt:      timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    // Query patterns that must be fast:
    agentIdx:          index('executions_agent_id_idx').on(t.agentId),
    tenantIdx:         index('executions_tenant_id_idx').on(t.tenantId),
    statusIdx:         index('executions_status_idx').on(t.status),
    traceIdx:          index('executions_trace_id_idx').on(t.traceId),
    createdIdx:        index('executions_created_at_idx').on(t.createdAt),
    tenantStatusIdx:   index('executions_tenant_status_idx').on(t.tenantId, t.status),
    workerIdx:         index('executions_worker_id_idx').on(t.workerId),
    // Idempotency key must be globally unique per tenant.
    // Partial unique index: only enforced when idempotencyKey IS NOT NULL.
    idempotencyIdx:    uniqueIndex('executions_idempotency_key_uidx')
                         .on(t.tenantId, t.idempotencyKey)
                         .where(text('idempotency_key IS NOT NULL')),
  }),
);

export type Execution    = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
