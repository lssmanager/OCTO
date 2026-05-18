// packages/database/src/schema/executions.ts
// System of record for every execution run.
// PostgreSQL IS the source of truth -- Redis is transient queue only.
//
// ADR: F0-004 (Durable Execution), F0-015 (Multi-Tenancy from day one)
// ADR: ADR-0016 (Secret Hygiene), ADR-0017 (State Machine)
//
// H1 HARDENING -- Lease + Heartbeat columns added (migration 0003).
// heartbeat_at      -- refreshed every 30s by the active worker
// lease_expires_at  -- NOW() + 90s; reclaim scanner fires when expired
//
// STATE MACHINE INVARIANT:
// ALL status mutations MUST go through:
//   packages/runtime-state/src/execution-state.service.ts -> transition()
// Raw db.update(executions).set({ status: ... }) outside that service
// is blocked by the ESLint rule: no-raw-execution-status-write

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
import { sql } from 'drizzle-orm';
import { agents } from './agents';

// --- STATUS ENUM ---
export const executionStatusEnum = pgEnum('execution_status', [
  'pending',
  'queued',
  'running',
  'waiting_tool',
  'waiting_human',
  'retrying',
  'suspended',
  'completed',
  'failed',
  'cancelled',
]);

// --- TRIGGER SOURCE ENUM ---
export const triggerSourceEnum = pgEnum('trigger_source', [
  'api',
  'schedule',
  'channel',
  'delegation',
  'replay',
]);

// --- TABLE ---
export const executions = pgTable(
  'executions',
  {
    id:             text('id').primaryKey(),
    tenantId:       text('tenant_id').notNull(),
    agentId:        text('agent_id')
                      .notNull()
                      .references(() => agents.id),
    idempotencyKey: text('idempotency_key'),
    triggerSource:  triggerSourceEnum('trigger_source').notNull().default('api'),
    triggerRef:     text('trigger_ref'),
    status:         executionStatusEnum('status').notNull().default('pending'),
    attempt:        integer('attempt').notNull().default(0),
    queueJobId:     text('queue_job_id'),
    workerId:       text('worker_id'),

    // H1: Lease + Heartbeat
    // INVARIANT: worker_id MUST be set when status='running'.
    // INVARIANT: Workers must NOT reclaim executions they still own.
    //   Use WHERE worker_id = $expectedId in reclaim UPDATE.
    heartbeatAt:    timestamp('heartbeat_at',    { withTimezone: true }),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),

    task:           jsonb('task').notNull(),
    governance:     jsonb('governance').notNull(),
    result:         jsonb('result'),
    error:          jsonb('error'),
    traceId:        text('trace_id').notNull(),
    runId:          text('run_id').notNull(),
    tokenUsage:     jsonb('token_usage'),
    costUsd:        jsonb('cost_usd'),
    // F2: LangGraph checkpoint support (pause/resume)
    // Stores the serialized graph state blob inline.
    // lastCheckpointId references an external checkpoint store ID.
    checkpoint:       jsonb('checkpoint'),
    lastCheckpointId: text('last_checkpoint_id'),
    startedAt:      timestamp('started_at'),
    completedAt:    timestamp('completed_at'),
    createdAt:      timestamp('created_at').notNull().defaultNow(),
    updatedAt:      timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    agentIdx:          index('executions_agent_id_idx').on(t.agentId),
    tenantIdx:         index('executions_tenant_id_idx').on(t.tenantId),
    statusIdx:         index('executions_status_idx').on(t.status),
    traceIdx:          index('executions_trace_id_idx').on(t.traceId),
    createdIdx:        index('executions_created_at_idx').on(t.createdAt),
    tenantStatusIdx:   index('executions_tenant_status_idx').on(t.tenantId, t.status),
    workerIdx:         index('executions_worker_id_idx').on(t.workerId),
    // H1 - reclaim scanner + heartbeat monitoring indexes
    leaseIdx:          index('idx_executions_lease').on(t.status, t.leaseExpiresAt),
    heartbeatIdx:      index('idx_executions_heartbeat').on(t.status, t.heartbeatAt),
    // FIX: use sql`` template — text() returns PgTextBuilder, not SQL<unknown>
    idempotencyIdx:    uniqueIndex('executions_idempotency_key_uidx')
                         .on(t.tenantId, t.idempotencyKey)
                         .where(sql`idempotency_key IS NOT NULL`),
  }),
);

export type Execution    = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
