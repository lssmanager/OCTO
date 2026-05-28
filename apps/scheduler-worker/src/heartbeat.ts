import { getDb } from '@octo/database';
import { upsertWorkerHeartbeat } from '@octo/runtime-state';

let timer: NodeJS.Timeout | null = null;

export function startHeartbeat(db: ReturnType<typeof getDb>, instanceId: string): void {
  const startedAt = new Date();
  const intervalMs = Number(process.env['WORKER_HEARTBEAT_INTERVAL_MS'] ?? '30000');

  const beat = async () => {
    try {
      await upsertWorkerHeartbeat(db, {
        workerType: 'scheduler-worker',
        instanceId,
        status: 'ok',
        startedAt,
        version: process.env['BUILD_VERSION'],
        commitSha: process.env['BUILD_COMMIT'],
        metadata: { runtimeUrlConfigured: Boolean(process.env['RUNTIME_WORKER_URL']) },
      });
    } catch (err) {
      console.error('scheduler_heartbeat_failed', err);
    }
    timer = setTimeout(() => void beat(), intervalMs);
  };

  void beat();
}

export function stopHeartbeat(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
