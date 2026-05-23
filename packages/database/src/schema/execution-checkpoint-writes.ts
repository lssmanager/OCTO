import { pgTable, text, integer, jsonb, index } from 'drizzle-orm/pg-core';
import { executionCheckpoints } from './execution-checkpoints';

export const executionCheckpointWrites = pgTable(
  'execution_checkpoint_writes',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    checkpointId: text('checkpoint_id')
      .notNull()
      .references(() => executionCheckpoints.id, { onDelete: 'cascade' }),
    taskId: text('task_id').notNull(),
    taskPath: text('task_path').notNull().default(''),
    writeIndex: integer('write_index').notNull(),
    channel: text('channel').notNull(),
    type: text('type'),
    valueJson: jsonb('value_json').notNull(),
  },
  (t) => ({
    tenantCheckpointWriteIdx: index('idx_checkpoint_writes_tenant_checkpoint_write').on(
      t.tenantId,
      t.checkpointId,
      t.writeIndex
    ),
  })
);

export type ExecutionCheckpointWrite = typeof executionCheckpointWrites.$inferSelect;
export type NewExecutionCheckpointWrite = typeof executionCheckpointWrites.$inferInsert;
