// packages/database/src/schema/execution-events.ts
// Renamed from events.ts for naming consistency with the execution-* schema files.
// Append-only execution event log — the audit trail for every execution.
//
// IMPORTANT: this file supersedes packages/database/src/schema/events.ts
// The old events.ts will be removed in the next cleanup commit once
// all import sites are updated.
//
// Design invariants:
// - NEVER update or delete rows in this table
// - bigint PK with GENERATED ALWAYS AS IDENTITY ensures
//   sequential, gap-free ordering without application coordination
// - tenantId enables per-tenant replay and audit export
// - source identifies which worker emitted the event
//
// ADR: F0-015 (Observability), F0-007 (Replayability)

import { pgTable, text, timestamp, jsonb, bigint, index } from 'drizzle-orm/pg-core';
import { executions } from './executions';

export const executionEvents = pgTable(
  'execution_events',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey().generatedAlwaysAsIdentity(),

    // Nullable — supports system-level events not tied to a specific execution
    // (worker health changes, governance alerts, budget warnings)
    executionId: text('execution_id').references(() => executions.id),

    // ── OctoEvent envelope fields (denormalized for fast filtering) ───────────
    tenantId: text('tenant_id').notNull(),
    traceId: text('trace_id').notNull(),
    runId: text('run_id').notNull(),
    agentId: text('agent_id'),
    // Which service emitted this event (e.g. 'api', 'runtime-worker')
    source: text('source').notNull(),

    // ── Event data ────────────────────────────────────────────────────────────
    type: text('type').notNull(), // OctoEventType string
    payload: jsonb('payload').notNull(),
    metadata: jsonb('metadata').notNull(), // full OctoEvent<T>.metadata blob

    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    executionIdx: index('exec_events_execution_id_idx').on(t.executionId),
    tenantIdx: index('exec_events_tenant_id_idx').on(t.tenantId),
    typeIdx: index('exec_events_type_idx').on(t.type),
    traceIdx: index('exec_events_trace_id_idx').on(t.traceId),
    runIdIdx: index('exec_events_run_id_idx').on(t.runId),
    createdIdx: index('exec_events_created_at_idx').on(t.createdAt),
    tenantCreatedIdx: index('exec_events_tenant_created_at_idx').on(t.tenantId, t.createdAt),
  })
);

export type ExecutionEvent = typeof executionEvents.$inferSelect;
export type NewExecutionEvent = typeof executionEvents.$inferInsert;
