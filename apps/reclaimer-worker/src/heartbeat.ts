import { getDb } from '@octo/database';
import { upsertWorkerHeartbeat } from '@octo/runtime-state';

let timer: NodeJS.Timeout | null = null;

export function startHeartbeat(db: ReturnType<typeof getDb>): void {
  const startedAt = new Date();
  const intervalMs = Number(process.env['WORKER_HEARTBEAT_INTERVAL_MS'] ?? '30000');
  const instanceId = process.env['WORKER_INSTANCE_ID'] ?? `reclaimer-${process.pid}`;

  const beat = async () => {
    try {
      await upsertWorkerHeartbeat(db, {
        workerType: 'reclaimer-worker',
        instanceId,
        status: 'ok',
        startedAt,
        version: process.env['BUILD_VERSION'],
        commitSha: process.env['BUILD_COMMIT'],
      });
    } catch (err) {
      console.error(
        JSON.stringify({
          msg: 'worker_heartbeat_failed',
          workerType: 'reclaimer-worker',
          instanceId,
          error: String(err),
        })
      );
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
