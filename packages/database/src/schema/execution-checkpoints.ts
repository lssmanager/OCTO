import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
  uniqueIndex,
  type AnyPgColumn,
  pgEnum,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';

export const checkpointSourceEnum = pgEnum('checkpoint_source', [
  'input',
  'loop',
  'tool',
  'approval',
  'reclaim',
  'final',
]);

export const executionCheckpoints = pgTable(
  'execution_checkpoints',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('legacy'),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(),
    source: checkpointSourceEnum('source').notNull().default('input'),
    parentCheckpointId: text('parent_checkpoint_id').references(
      (): AnyPgColumn => executionCheckpoints.id
    ),
    stateJson: jsonb('state_json').notNull().default({}),
    channelVersions: jsonb('channel_versions').notNull().default({}),
    versionsSeen: jsonb('versions_seen').notNull().default({}),
    metadataJson: jsonb('metadata_json').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),

    state: jsonb('state').notNull().default({}),
    metadata: jsonb('metadata'),
    workerId: text('worker_id'),
    schemaVersion: integer('schema_version').notNull().default(1),
  },
  (t) => ({
    executionIdx: index('execution_checkpoints_execution_id_idx').on(t.executionId),
    stepIndexIdx: index('execution_checkpoints_step_index_idx').on(t.executionId, t.stepIndex),
    f1ExecutionStepIndexIdx: index('idx_checkpoints_execution_step_index').on(
      t.executionId,
      t.stepIndex.desc()
    ),
    tenantExecutionStepIdx: index('idx_checkpoints_tenant_execution_step').on(
      t.tenantId,
      t.executionId,
      t.stepIndex.desc()
    ),
    lineageIdx: uniqueIndex('idx_checkpoints_execution_step_source').on(
      t.executionId,
      t.stepIndex,
      t.source
    ),
    parentIdx: index('idx_checkpoints_parent').on(t.parentCheckpointId),
    createdIdx: index('execution_checkpoints_created_at_idx').on(t.createdAt),
    workerIdx: index('execution_checkpoints_worker_id_idx').on(t.workerId),
  })
);

export type ExecutionCheckpoint = typeof executionCheckpoints.$inferSelect;
export type NewExecutionCheckpoint = typeof executionCheckpoints.$inferInsert;
