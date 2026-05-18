// packages/database/src/schema/execution-checkpoints.ts
// Serialized graph state for pause / resume / replay.
//
// A checkpoint is written by the runtime-worker BEFORE any step that
// modifies external state (LLM call, tool dispatch, delegation).
// On resume after crash or approval gate, the runtime loads the
// latest checkpoint and replays only steps after stepIndex.
//
// Only the latest checkpoint per execution is operationally required.
// Older checkpoints are retained for audit and replay tooling.
//
// Forward compatibility: schemaVersion allows safe deserialization
// when the ExecutionGraph shape evolves between F0 → F1 → F2.
//
// ADR: F0-004 (Durable Execution), F0-007 (Replayability)

import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';

export const executionCheckpoints = pgTable(
  'execution_checkpoints',
  {
    id:          text('id').primaryKey(),    // UUID v7
    executionId: text('execution_id')
                   .notNull()
                   .references(() => executions.id, { onDelete: 'cascade' }),

    // Last completed stepIndex before this checkpoint was written.
    // On resume: load this checkpoint, then execute steps > stepIndex.
    stepIndex:   integer('step_index').notNull(),

    // Full serialized ExecutionGraph — shape defined in packages/contracts.
    // Never truncated. If this grows beyond 1MB, migrate to MinIO blob + pointer.
    state:       jsonb('state').notNull(),

    // Runtime context at checkpoint time. Useful for debugging without
    // deserializing the full state blob.
    metadata:    jsonb('metadata'),  // { model, provider, temperature, agentVersion }

    // Which worker instance wrote this checkpoint.
    // Used to detect stale checkpoints from crashed workers.
    workerId:    text('worker_id'),

    // Schema version of the ExecutionGraph serialization format.
    // Increment when the state shape changes. Deserialization code must
    // handle all versions >= 1.
    schemaVersion: integer('schema_version').notNull().default(1),

    createdAt:   timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    executionIdx: index('execution_checkpoints_execution_id_idx').on(t.executionId),
    // Fast lookup: latest checkpoint for an execution (ORDER BY step_index DESC LIMIT 1)
    stepIndexIdx: index('execution_checkpoints_step_index_idx').on(t.executionId, t.stepIndex),
    createdIdx:   index('execution_checkpoints_created_at_idx').on(t.createdAt),
    workerIdx:    index('execution_checkpoints_worker_id_idx').on(t.workerId),
  }),
);

export type ExecutionCheckpoint    = typeof executionCheckpoints.$inferSelect;
export type NewExecutionCheckpoint = typeof executionCheckpoints.$inferInsert;
