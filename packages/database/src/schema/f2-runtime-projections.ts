import { relations } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import {
  executionSourceEnum,
  executions,
  executionStatusEnum,
  replayExecutionModeEnum,
} from './executions';
import { executionCheckpoints } from './execution-checkpoints';
import { toolInvocations } from './tool-invocations';
import { workerTypeEnum } from './worker-heartbeats';

export const workerRuntimeStateEnum = pgEnum('worker_runtime_state', [
  'ok',
  'degraded',
  'unknown',
  'error',
  'not_active',
]);

export const timelineEntryTypeEnum = pgEnum('timeline_entry_type', [
  'state',
  'step',
  'tool',
  'reclaim',
  'retry',
  'approval',
  'replay',
]);

export const timelineSeverityEnum = pgEnum('timeline_severity', ['info', 'warning', 'error']);

export const toolProjectionStatusEnum = pgEnum('tool_projection_status', [
  'pending',
  'running',
  'succeeded',
  'failed',
  'timed_out',
  'blocked',
]);

export const toolSideEffectLevelEnum = pgEnum('tool_side_effect_level', [
  'none',
  'low',
  'high',
]);

export const budgetStateEnum = pgEnum('budget_state', ['ok', 'pressure', 'exceeded']);

export const executionRuntimeProjection = pgTable(
  'execution_runtime_projection',
  {
    executionId: text('execution_id')
      .primaryKey()
      .references(() => executions.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    source: executionSourceEnum('source').notNull().default('live'),
    status: executionStatusEnum('status').notNull(),
    currentStepIndex: integer('current_step_index'),
    retryCount: integer('retry_count').notNull().default(0),
    reclaimCount: integer('reclaim_count').notNull().default(0),
    dispatchedAt: timestamp('dispatched_at', { withTimezone: true }),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    replayOfExecutionId: text('replay_of_execution_id').references(() => executions.id, {
      onDelete: 'set null',
    }),
    replayFromCheckpointId: text('replay_from_checkpoint_id').references(
      () => executionCheckpoints.id,
      { onDelete: 'set null' }
    ),
    replayMode: replayExecutionModeEnum('replay_mode'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantStatusUpdatedIdx: index('idx_exec_runtime_projection_tenant_status_updated').on(
      t.tenantId,
      t.status,
      t.updatedAt.desc()
    ),
    tenantExecutionIdx: index('idx_exec_runtime_projection_tenant_execution').on(
      t.tenantId,
      t.executionId
    ),
  })
);

export const executionTimelineProjection = pgTable(
  'execution_timeline_projection',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    eventId: text('event_id').notNull(),
    timelineIndex: integer('timeline_index').notNull(),
    entryType: timelineEntryTypeEnum('entry_type').notNull(),
    stepIndex: integer('step_index'),
    severity: timelineSeverityEnum('severity').notNull().default('info'),
    title: text('title').notNull(),
    summary: text('summary'),
    source: text('source').notNull(),
    payloadJson: jsonb('payload_json').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantExecutionEventUnique: uniqueIndex('uq_exec_timeline_projection_tenant_event').on(
      t.tenantId,
      t.executionId,
      t.eventId
    ),
    tenantExecutionTimelineUnique: uniqueIndex('uq_exec_timeline_projection_tenant_index').on(
      t.tenantId,
      t.executionId,
      t.timelineIndex
    ),
    tenantExecutionTimelineIdx: index('idx_exec_timeline_projection_tenant_execution_timeline').on(
      t.tenantId,
      t.executionId,
      t.timelineIndex
    ),
  })
);

export const toolInvocationProjection = pgTable(
  'tool_invocation_projection',
  {
    toolInvocationId: text('tool_invocation_id')
      .primaryKey()
      .references(() => toolInvocations.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index'),
    toolName: text('tool_name').notNull(),
    status: toolProjectionStatusEnum('status').notNull(),
    sideEffectLevel: toolSideEffectLevelEnum('side_effect_level').notNull(),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    durationMs: integer('duration_ms'),
    validatedInputJson: jsonb('validated_input_json'),
    validatedOutputJson: jsonb('validated_output_json'),
    errorJson: jsonb('error_json'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantExecutionUpdatedIdx: index('idx_tool_inv_projection_tenant_execution_updated').on(
      t.tenantId,
      t.executionId,
      t.updatedAt.desc()
    ),
  })
);

export const workerRuntimeProjection = pgTable(
  'worker_runtime_projection',
  {
    workerType: workerTypeEnum('worker_type').notNull(),
    instanceId: text('instance_id').notNull(),
    state: workerRuntimeStateEnum('state').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }),
    version: text('version'),
    commitSha: text('commit_sha'),
    diagnosticsJson: jsonb('diagnostics_json').notNull().default({}),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.workerType, t.instanceId], name: 'pk_worker_runtime_projection' }),
    workerHeartbeatIdx: index('idx_worker_runtime_projection_worker_heartbeat').on(
      t.workerType,
      t.lastHeartbeatAt.desc()
    ),
  })
);

export const queueRuntimeProjection = pgTable(
  'queue_runtime_projection',
  {
    queueName: text('queue_name').primaryKey(),
    backlog: integer('backlog').notNull().default(0),
    inflight: integer('inflight').notNull().default(0),
    delayed: integer('delayed').notNull().default(0),
    failedRecent: integer('failed_recent').notNull().default(0),
    dlqCount: integer('dlq_count').notNull().default(0),
    oldestJobAgeMs: bigint('oldest_job_age_ms', { mode: 'number' }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    updatedIdx: index('idx_queue_runtime_projection_updated').on(t.updatedAt.desc()),
  })
);

export const executionCostProjection = pgTable(
  'execution_cost_projection',
  {
    executionId: text('execution_id')
      .primaryKey()
      .references(() => executions.id, { onDelete: 'cascade' }),
    tenantId: text('tenant_id').notNull(),
    provider: text('provider'),
    model: text('model'),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    totalTokens: integer('total_tokens').notNull().default(0),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 18, scale: 8 })
      .notNull()
      .default('0'),
    budgetState: budgetStateEnum('budget_state').notNull().default('ok'),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantCostIdx: index('idx_exec_cost_projection_tenant_cost').on(
      t.tenantId,
      t.estimatedCostUsd.desc()
    ),
  })
);

export const outboxRuntimeProjection = pgTable(
  'outbox_runtime_projection',
  {
    streamName: text('stream_name').primaryKey(),
    unpublishedCount: integer('unpublished_count').notNull().default(0),
    publishLagMs: bigint('publish_lag_ms', { mode: 'number' }),
    lastFailedEventType: text('last_failed_event_type'),
    dlqCount: integer('dlq_count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    updatedIdx: index('idx_outbox_runtime_projection_updated').on(t.updatedAt.desc()),
  })
);

export const executionRuntimeProjectionRelations = relations(
  executionRuntimeProjection,
  ({ one }) => ({
    execution: one(executions, {
      fields: [executionRuntimeProjection.executionId],
      references: [executions.id],
    }),
    replayFromCheckpoint: one(executionCheckpoints, {
      fields: [executionRuntimeProjection.replayFromCheckpointId],
      references: [executionCheckpoints.id],
    }),
  })
);

export const executionTimelineProjectionRelations = relations(
  executionTimelineProjection,
  ({ one }) => ({
    execution: one(executions, {
      fields: [executionTimelineProjection.executionId],
      references: [executions.id],
    }),
  })
);

export const toolInvocationProjectionRelations = relations(
  toolInvocationProjection,
  ({ one }) => ({
    execution: one(executions, {
      fields: [toolInvocationProjection.executionId],
      references: [executions.id],
    }),
    toolInvocation: one(toolInvocations, {
      fields: [toolInvocationProjection.toolInvocationId],
      references: [toolInvocations.id],
    }),
  })
);

export type ExecutionRuntimeProjection = typeof executionRuntimeProjection.$inferSelect;
export type NewExecutionRuntimeProjection = typeof executionRuntimeProjection.$inferInsert;
export type ExecutionTimelineProjection = typeof executionTimelineProjection.$inferSelect;
export type NewExecutionTimelineProjection = typeof executionTimelineProjection.$inferInsert;
export type ToolInvocationProjection = typeof toolInvocationProjection.$inferSelect;
export type NewToolInvocationProjection = typeof toolInvocationProjection.$inferInsert;
export type WorkerRuntimeProjection = typeof workerRuntimeProjection.$inferSelect;
export type NewWorkerRuntimeProjection = typeof workerRuntimeProjection.$inferInsert;
export type QueueRuntimeProjection = typeof queueRuntimeProjection.$inferSelect;
export type NewQueueRuntimeProjection = typeof queueRuntimeProjection.$inferInsert;
export type ExecutionCostProjection = typeof executionCostProjection.$inferSelect;
export type NewExecutionCostProjection = typeof executionCostProjection.$inferInsert;
export type OutboxRuntimeProjection = typeof outboxRuntimeProjection.$inferSelect;
export type NewOutboxRuntimeProjection = typeof outboxRuntimeProjection.$inferInsert;
