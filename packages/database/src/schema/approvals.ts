import { pgTable, text, timestamp, jsonb, index } from 'drizzle-orm/pg-core';
import { executions } from './executions';
import { executionSteps } from './execution-steps';

export const approvals = pgTable(
  'approvals',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    stepId: text('step_id')
      .notNull()
      .references(() => executionSteps.id),
    kind: text('kind').notNull(),
    status: text('status').notNull(),
    title: text('title').notNull(),
    reason: text('reason').notNull(),
    payloadJson: jsonb('payload_json').notNull(),
    timeoutAt: timestamp('timeout_at', { withTimezone: true }),
    resolvedBy: text('resolved_by'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionJson: jsonb('resolution_json'),
  },
  (t) => ({
    tenantStatusTimeoutIdx: index('idx_approvals_tenant_status_timeout').on(
      t.tenantId,
      t.status,
      t.timeoutAt
    ),
    executionStatusIdx: index('idx_approvals_execution_status').on(t.executionId, t.status),
  })
);

export type Approval = typeof approvals.$inferSelect;
export type NewApproval = typeof approvals.$inferInsert;
