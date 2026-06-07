import { pgTable, text, timestamp, jsonb, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';

export const workerTypeEnum = pgEnum('worker_type', [
  'runtime-worker',
  'scheduler-worker',
  'reclaimer-worker',
  'outbox-publisher-worker',
]);

export const workerHeartbeatStatusEnum = pgEnum('worker_heartbeat_status', [
  'starting',
  'ok',
  'degraded',
  'stopping',
  'error',
]);

export const workerHeartbeats = pgTable(
  'worker_heartbeats',
  {
    id: text('id').primaryKey(),
    workerType: workerTypeEnum('worker_type').notNull(),
    instanceId: text('instance_id').notNull(),
    status: workerHeartbeatStatusEnum('status').notNull().default('starting'),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
    lastHeartbeatAt: timestamp('last_heartbeat_at', { withTimezone: true }).notNull(),
    version: text('version'),
    commitSha: text('commit_sha'),
    metadata: jsonb('metadata').notNull().default({}),
    error: text('error'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    workerTypeIdx: index('worker_heartbeats_worker_type_idx').on(t.workerType),
    lastHeartbeatIdx: index('worker_heartbeats_last_heartbeat_idx').on(t.lastHeartbeatAt),
    typeHeartbeatIdx: index('worker_heartbeats_type_last_heartbeat_idx').on(
      t.workerType,
      t.lastHeartbeatAt
    ),
    uniqueWorkerInstanceIdx: uniqueIndex('worker_heartbeats_type_instance_uidx').on(
      t.workerType,
      t.instanceId
    ),
  })
);

export type WorkerHeartbeat = typeof workerHeartbeats.$inferSelect;
export type NewWorkerHeartbeat = typeof workerHeartbeats.$inferInsert;
