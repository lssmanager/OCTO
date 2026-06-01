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
import { agentVersions } from './agent-versions';

export const executionStatusEnum = pgEnum('execution_status', [
  'pending',
  'queued',
  'dispatched',
  'running',
  'waiting_tool',
  'waiting_human',
  'retrying',
  'retry_scheduled',
  'suspended',
  'reclaimable',
  'completed',
  'failed',
  'cancelled',
]);

export const triggerSourceEnum = pgEnum('trigger_source', [
  'api',
  'schedule',
  'channel',
  'delegation',
  'replay',
]);

export const executions = pgTable(
  'executions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    agentVersionId: text('agent_version_id')
      .notNull()
      .references(() => agentVersions.id),
    // Legacy alias kept in sync with status during F1 migration; status is canonical.
    state: text('state').notNull(),
    version: integer('version').notNull().default(0),
    inputJson: jsonb('input_json').notNull().default({}),
    outputJson: jsonb('output_json'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    attemptCount: integer('attempt_count').notNull().default(0),
    reclaimCount: integer('reclaim_count').notNull().default(0),
    leaseOwner: text('lease_owner'),
    leaseToken: text('lease_token'),
    leaseExpiresAt: timestamp('lease_expires_at', { withTimezone: true }),
    cancellationRequestedAt: timestamp('cancellation_requested_at', { withTimezone: true }),
    budgetSnapshotJson: jsonb('budget_snapshot_json').notNull().default({}),
    contextSnapshotJson: jsonb('context_snapshot_json').notNull().default({}),
    createdBy: text('created_by').notNull().default('system'),

    idempotencyKey: text('idempotency_key'),
    triggerSource: triggerSourceEnum('trigger_source').notNull().default('api'),
    triggerRef: text('trigger_ref'),
    status: executionStatusEnum('status').notNull().default('pending'),
    attempt: integer('attempt').notNull().default(0),
    queueJobId: text('queue_job_id'),
    workerId: text('worker_id'),
    heartbeatAt: timestamp('heartbeat_at', { withTimezone: true }),
    reclaimedAt: timestamp('reclaimed_at', { withTimezone: true }),
    task: jsonb('task').notNull().default({}),
    governance: jsonb('governance').notNull().default({}),
    result: jsonb('result'),
    error: jsonb('error'),
    traceId: text('trace_id').notNull().default(''),
    runId: text('run_id').notNull().default(''),
    tokenUsage: jsonb('token_usage'),
    costUsd: jsonb('cost_usd'),
    checkpoint: jsonb('checkpoint'),
    lastCheckpointId: text('last_checkpoint_id'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    agentIdx: index('executions_agent_id_idx').on(t.agentId),
    tenantIdx: index('executions_tenant_id_idx').on(t.tenantId),
    statusIdx: index('executions_status_idx').on(t.status),
    traceIdx: index('executions_trace_id_idx').on(t.traceId),
    createdIdx: index('executions_created_at_idx').on(t.createdAt),
    tenantStatusIdx: index('executions_tenant_status_idx').on(t.tenantId, t.status),
    workerIdx: index('executions_worker_id_idx').on(t.workerId),
    leaseIdx: index('idx_executions_lease').on(t.status, t.leaseExpiresAt),
    leaseTokenIdx: index('idx_executions_lease_token').on(
      t.tenantId,
      t.id,
      t.attempt,
      t.leaseToken
    ),
    heartbeatIdx: index('idx_executions_heartbeat').on(t.status, t.heartbeatAt),
    f1TenantStateCreatedIdx: index('idx_executions_tenant_state_created').on(
      t.tenantId,
      t.status,
      t.createdAt.desc()
    ),
    f1LeaseStaleIdx: index('idx_executions_lease_stale')
      .on(t.status, t.leaseExpiresAt)
      .where(sql`status IN ('running', 'reclaimable', 'dispatched')`),
    idempotencyIdx: uniqueIndex('executions_idempotency_key_uidx')
      .on(t.tenantId, t.idempotencyKey)
      .where(sql`idempotency_key IS NOT NULL`),
  })
);

export type Execution = typeof executions.$inferSelect;
export type NewExecution = typeof executions.$inferInsert;
