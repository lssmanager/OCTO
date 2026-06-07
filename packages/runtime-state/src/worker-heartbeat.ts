import { sql } from 'drizzle-orm';
import type { getDb } from '@octo/database';

type Db = ReturnType<typeof getDb>;

export type WorkerType =
  | 'runtime-worker'
  | 'scheduler-worker'
  | 'reclaimer-worker'
  | 'outbox-publisher-worker';
export type WorkerHeartbeatStatus = 'starting' | 'ok' | 'degraded' | 'stopping' | 'error';

export interface WorkerHeartbeatInput {
  workerType: WorkerType;
  instanceId: string;
  status: WorkerHeartbeatStatus;
  startedAt: Date;
  version?: string | undefined;
  commitSha?: string | undefined;
  metadata?: Record<string, unknown> | undefined;
  error?: string | null | undefined;
}

export async function upsertWorkerHeartbeat(db: Db, input: WorkerHeartbeatInput): Promise<void> {
  await db.execute(sql`
    INSERT INTO worker_heartbeats (
      id,
      worker_type,
      instance_id,
      status,
      started_at,
      last_heartbeat_at,
      version,
      commit_sha,
      metadata,
      error,
      updated_at
    )
    VALUES (
      ${`${input.workerType}:${input.instanceId}`},
      ${input.workerType},
      ${input.instanceId},
      ${input.status},
      ${input.startedAt},
      now(),
      ${input.version ?? null},
      ${input.commitSha ?? null},
      ${JSON.stringify(input.metadata ?? {})}::jsonb,
      ${input.error ?? null},
      now()
    )
    ON CONFLICT (worker_type, instance_id)
    DO UPDATE SET
      status = EXCLUDED.status,
      last_heartbeat_at = now(),
      version = EXCLUDED.version,
      commit_sha = EXCLUDED.commit_sha,
      metadata = EXCLUDED.metadata,
      error = EXCLUDED.error,
      updated_at = now()
  `);
}
