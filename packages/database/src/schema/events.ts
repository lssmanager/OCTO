// packages/database/src/schema/events.ts
// Append-only execution event log — the audit trail for every execution.
//
// Design invariants:
// - NEVER update or delete rows in this table
// - bigint PK with GENERATED ALWAYS AS IDENTITY ensures
//   sequential, gap-free ordering without application coordination
// - tenantId enables per-tenant replay and audit export
// - source identifies which worker emitted the event
//
// This table is the replayability foundation: given a run_id,
// all events can be fetched in order and re-applied to reconstruct
// full execution history.
//
// ADR: F0-015 (Observability), F0-007 (Replayability)

import { pgTable, text, timestamp, jsonb, bigint, index } from 'drizzle-orm/pg-core';
import { executions } from './executions';

export const executionEvents = pgTable(
  'execution_events',
  {
    // Sequential identity PK — enables efficient range scans and
    // ORDER BY id for deterministic replay ordering.
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),

    // Foreign key to executions — nullable to support system-level events
    // (worker health changes, governance alerts) that are not tied to
    // a specific execution.
    executionId: text('execution_id').references(() => executions.id), // intentionally nullable — no .notNull()

    // ── OctoEvent envelope fields ─────────────────────────────────────────────
    // Denormalized from OctoEvent<T>.metadata for fast filtering.
    // tenantId enables per-tenant audit queries without JSON extraction.
    tenantId: text('tenant_id').notNull(),
    traceId: text('trace_id').notNull(),
    runId: text('run_id').notNull(),
    agentId: text('agent_id'),
    // Which service emitted this event (e.g. 'api', 'runtime-worker').
    source: text('source').notNull(),

    // ── Event data ────────────────────────────────────────────────────────────
    type: text('type').notNull(), // OctoEventType string
    payload: jsonb('payload').notNull(),
    metadata: jsonb('metadata').notNull(), // full OctoEvent metadata blob

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    executionIdx: index('events_execution_id_idx').on(t.executionId),
    tenantIdx: index('events_tenant_id_idx').on(t.tenantId),
    typeIdx: index('events_type_idx').on(t.type),
    traceIdx: index('events_trace_id_idx').on(t.traceId),
    runIdIdx: index('events_run_id_idx').on(t.runId),
    createdIdx: index('events_created_at_idx').on(t.createdAt),
    // Composite for tenant-scoped replay: WHERE tenant_id = ? ORDER BY id
    tenantCreatedIdx: index('events_tenant_created_at_idx').on(t.tenantId, t.createdAt),
  })
);

export type ExecutionEvent = typeof executionEvents.$inferSelect;
export type NewExecutionEvent = typeof executionEvents.$inferInsert;
