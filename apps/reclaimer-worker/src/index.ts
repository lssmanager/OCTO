/**
 * apps/reclaimer-worker/src/index.ts
 * Entry point for the reclaimer worker process.
 */

import { createServer, type Server } from 'node:http';
import { sql } from 'drizzle-orm';
import { getDb } from '@octo/database';

import { startHeartbeat, stopHeartbeat } from './heartbeat';
import { initMetrics } from './metrics';
import { startReclaimLoop, stopReclaimLoop } from './reclaim-loop';

const DATABASE_URL = process.env['DATABASE_URL'];
const REDIS_URL = process.env['REDIS_URL'];

if (!DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!REDIS_URL) throw new Error('REDIS_URL is required');

const RECLAIM_INTERVAL_MS = parseInt(process.env['RECLAIM_INTERVAL_MS'] ?? '15000', 10);
const LEASE_TIMEOUT_MS = parseInt(process.env['LEASE_TIMEOUT_MS'] ?? '30000', 10);
const MAX_RECLAIM_ATTEMPTS = parseInt(process.env['MAX_RECLAIM_ATTEMPTS'] ?? '3', 10);
const HEALTH_PORT = parseInt(process.env['RECLAIMER_HEALTH_PORT'] ?? '3011', 10);

let ready = false;
let healthServer: Server | null = null;
let lastReadinessError: string | null = null;

function startHealthServer(db: ReturnType<typeof getDb>) {
  healthServer = createServer(async (req, res) => {
    if (req.url === '/health/live') {
      res.statusCode = 200;
      res.end('ok');
      return;
    }

    if (req.url === '/health/ready') {
      try {
        await db.execute(sql`select 1`);
        lastReadinessError = null;
        res.statusCode = ready ? 200 : 503;
        res.end(ready ? 'ready' : 'booting');
      } catch (error) {
        lastReadinessError = error instanceof Error ? error.message : String(error);
        res.statusCode = 503;
        res.end(`not_ready:${lastReadinessError}`);
      }
      return;
    }

    if (req.url === '/health/status') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(
        JSON.stringify({
          ready,
          reclaimIntervalMs: RECLAIM_INTERVAL_MS,
          leaseTimeoutMs: LEASE_TIMEOUT_MS,
          maxReclaimAttempts: MAX_RECLAIM_ATTEMPTS,
          lastReadinessError,
        })
      );
      return;
    }

    res.statusCode = 404;
    res.end('not_found');
  });

  healthServer.listen(HEALTH_PORT, () => {
    console.log(JSON.stringify({ msg: 'reclaimer_health_listening', port: HEALTH_PORT }));
  });
}

async function main() {
  console.log(
    JSON.stringify({
      msg: 'reclaimer_starting',
      reclaimIntervalMs: RECLAIM_INTERVAL_MS,
      leaseTimeoutMs: LEASE_TIMEOUT_MS,
      maxReclaimAttempts: MAX_RECLAIM_ATTEMPTS,
      pid: process.pid,
    })
  );

  const db = getDb();
  initMetrics();
  startHeartbeat(db);
  startHealthServer(db);

  await startReclaimLoop(db, REDIS_URL!, {
    intervalMs: RECLAIM_INTERVAL_MS,
    leaseTimeoutMs: LEASE_TIMEOUT_MS,
    maxReclaimAttempts: MAX_RECLAIM_ATTEMPTS,
  });

  ready = true;
  console.log(JSON.stringify({ msg: 'reclaimer_ready' }));
}

const shutdown = async (signal: string) => {
  console.log(JSON.stringify({ msg: 'reclaimer_shutdown', signal }));
  ready = false;
  stopHeartbeat();
  await stopReclaimLoop();
  healthServer?.close();
  process.exit(0);
};

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

main().catch((err: unknown) => {
  console.error(JSON.stringify({ msg: 'reclaimer_fatal', error: String(err) }));
  process.exit(1);
});
