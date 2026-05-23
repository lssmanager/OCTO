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

export const stepStatusEnum = pgEnum('step_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'skipped',
  'QUEUED',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
]);

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

export const executionSteps = pgTable(
  'execution_steps',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('legacy'),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    stepType: stepTypeEnum('step_type').notNull(),
    stateFrom: text('state_from'),
    stateTo: text('state_to'),
    status: stepStatusEnum('status').notNull().default('pending'),
    inputJson: jsonb('input_json'),
    outputJson: jsonb('output_json'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),

    idempotencyKey: text('idempotency_key'),
    input: jsonb('input'),
    output: jsonb('output'),
    error: jsonb('error'),
    retryCount: integer('retry_count').notNull().default(0),
    lastError: jsonb('last_error'),
    traceId: text('trace_id'),
    spanId: text('span_id'),
    durationMs: integer('duration_ms'),
    completedAt: timestamp('completed_at'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    executionIdx: index('execution_steps_execution_id_idx').on(t.executionId),
    tenantExecutionIdx: index('idx_steps_tenant_execution').on(t.tenantId, t.executionId),
    statusIdx: index('execution_steps_status_idx').on(t.status),
    stepIndexIdx: uniqueIndex('execution_steps_execution_step_uidx').on(t.executionId, t.stepIndex),
    f1StepIndexIdx: index('idx_steps_execution_step_index').on(t.executionId, t.stepIndex),
    traceIdx: index('execution_steps_trace_id_idx').on(t.traceId),
    typeIdx: index('execution_steps_step_type_idx').on(t.stepType),
  })
);

export type ExecutionStep = typeof executionSteps.$inferSelect;
export type NewExecutionStep = typeof executionSteps.$inferInsert;
