import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  boolean,
  index,
  pgEnum,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';
import { executionSteps } from './execution-steps';
import { approvals } from './approvals';

export const toolInvocationStatusEnum = pgEnum('tool_invocation_status', [
  'pending',
  'running',
  'completed',
  'failed',
  'timeout',
  'PENDING',
  'RUNNING',
  'SUCCEEDED',
  'FAILED',
  'TIMED_OUT',
]);

export const toolInvocations = pgTable(
  'tool_invocations',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('legacy'),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    stepId: text('step_id')
      .notNull()
      .references(() => executionSteps.id),
    toolName: text('tool_name').notNull(),
    toolKind: text('tool_kind').notNull().default('builtin'),
    status: toolInvocationStatusEnum('status').notNull().default('pending'),
    argsJson: jsonb('args_json').notNull().default({}),
    resultJson: jsonb('result_json'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    requiresApproval: boolean('requires_approval').notNull().default(false),
    approvalId: text('approval_id').references(() => approvals.id, { onDelete: 'set null' }),
    idempotencyKey: text('idempotency_key').notNull(),
    durationMs: integer('duration_ms'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),

    toolVersion: text('tool_version'),
    input: jsonb('input').notNull().default({}),
    output: jsonb('output'),
    error: jsonb('error'),
    tokenUsage: jsonb('token_usage'),
    spanId: text('span_id'),
    traceId: text('trace_id'),
    invokedAt: timestamp('invoked_at').notNull().defaultNow(),
    completedAt: timestamp('completed_at'),
  },
  (t) => ({
    executionIdx: index('tool_invocations_execution_id_idx').on(t.executionId),
    stepIdx: index('tool_invocations_step_id_idx').on(t.stepId),
    toolNameIdx: index('tool_invocations_tool_name_idx').on(t.toolName),
    statusIdx: index('tool_invocations_status_idx').on(t.status),
    invokedAtIdx: index('tool_invocations_invoked_at_idx').on(t.invokedAt),
    traceIdx: index('tool_invocations_trace_id_idx').on(t.traceId),
    idempotencyIdx: uniqueIndex('idx_tool_invocations_idempotency').on(
      t.tenantId,
      t.idempotencyKey
    ),
    tenantExecutionIdx: index('idx_tool_invocations_tenant_execution').on(
      t.tenantId,
      t.executionId
    ),
    tenantStatusStartedIdx: index('idx_tool_invocations_tenant_status_started').on(
      t.tenantId,
      t.status,
      t.startedAt.desc()
    ),
  })
);

export type ToolInvocation = typeof toolInvocations.$inferSelect;
export type NewToolInvocation = typeof toolInvocations.$inferInsert;
