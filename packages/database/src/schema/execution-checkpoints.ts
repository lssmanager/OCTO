import {
  pgTable,
  text,
  timestamp,
  jsonb,
  integer,
  index,
} from 'drizzle-orm/pg-core';
import { executions } from './executions';

// ─────────────────────────────────────────────────────────────────
// execution_checkpoints — serialized graph state for pause / resume
//
// A checkpoint is a snapshot of the full execution graph state at
// a given stepIndex. Written by the runtime-worker before any step
// that modifies external state (LLM call, tool dispatch, delegation).
//
// On resume after crash or approval gate, the runtime loads the
// latest checkpoint and replays only steps after stepIndex.
//
// Only the latest checkpoint per execution is operationally relevant;
// older checkpoints are retained for audit / replay.
//
// state: serialized ExecutionGraph — shape defined in packages/contracts.
// metadata: runtime context (LLM provider, model, temperature, etc.)
//           useful for debugging without deserializing state.
// ─────────────────────────────────────────────────────────────────

export const executionCheckpoints = pgTable(
  'execution_checkpoints',
  {
    id: text('id').primaryKey(), // UUID v7
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    stepIndex: integer('step_index').notNull(), // last completed step before this checkpoint
    state: jsonb('state').notNull(),            // full serialized ExecutionGraph
    metadata: jsonb('metadata'),                // { model, provider, temperature, ... }
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => ({
    executionIdx:  index('execution_checkpoints_execution_id_idx').on(t.executionId),
    stepIndexIdx:  index('execution_checkpoints_step_index_idx').on(t.executionId, t.stepIndex),
    createdIdx:    index('execution_checkpoints_created_at_idx').on(t.createdAt),
  }),
);

export type ExecutionCheckpoint    = typeof executionCheckpoints.$inferSelect;
export type NewExecutionCheckpoint = typeof executionCheckpoints.$inferInsert;
