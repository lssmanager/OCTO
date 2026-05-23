/**
 * apps/reclaimer-worker/src/index.ts
 * Issue #34 — Zombie execution recovery
 *
 * Entry point for the reclaimer worker process.
 * Starts the polling loop and handles graceful shutdown on SIGTERM/SIGINT.
 *
 * ENV VARS:
 *   DATABASE_URL             required
 *   REDIS_URL                required
 *   RECLAIM_INTERVAL_MS      optional (default 15000)
 *   LEASE_TIMEOUT_MS         optional (default 30000)
 *   OTEL_EXPORTER_OTLP_ENDPOINT  optional
 */

import { createDb } from '@octo/database';
import { startReclaimLoop, stopReclaimLoop } from './reclaim-loop';
import { initMetrics } from './metrics';

const DATABASE_URL = process.env['DATABASE_URL'];
const REDIS_URL = process.env['REDIS_URL'];

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!REDIS_URL) throw new Error('REDIS_URL is required');

const RECLAIM_INTERVAL_MS = parseInt(process.env['RECLAIM_INTERVAL_MS'] ?? '15000', 10);
const LEASE_TIMEOUT_MS = parseInt(process.env['LEASE_TIMEOUT_MS'] ?? '30000', 10);

async function main() {
  console.log(
    JSON.stringify({
      msg: 'reclaimer_starting',
      reclaimIntervalMs: RECLAIM_INTERVAL_MS,
      leaseTimeoutMs: LEASE_TIMEOUT_MS,
      pid: process.pid,
    })
  );

  const db = createDb(DATABASE_URL!);
  initMetrics();

  await startReclaimLoop(db, REDIS_URL!, {
    intervalMs: RECLAIM_INTERVAL_MS,
    leaseTimeoutMs: LEASE_TIMEOUT_MS,
  });

  console.log(JSON.stringify({ msg: 'reclaimer_ready' }));
}

// Graceful shutdown
const shutdown = async (signal: string) => {
  console.log(JSON.stringify({ msg: 'reclaimer_shutdown', signal }));
  await stopReclaimLoop();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err: unknown) => {
  console.error(JSON.stringify({ msg: 'reclaimer_fatal', error: String(err) }));
  process.exit(1);
});
