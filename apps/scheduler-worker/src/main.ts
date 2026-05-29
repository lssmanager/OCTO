import { sql } from 'drizzle-orm';
import { createServer } from 'node:http';
import { createWorker, QUEUES, createRedisConnection, createQueue } from '@octo/queue';
import { db } from '@octo/database';
import { processExecutionDispatchJob, type DispatchPayload } from './dispatch-handler';
import { invokeRuntimeHttp } from './runtime-client';
import { startHeartbeat, stopHeartbeat } from './heartbeat';
const workerId = process.env['SCHEDULER_WORKER_ID'] ?? `scheduler-${process.pid}`;
const leaseSeconds = Number(process.env['EXECUTION_LEASE_SECONDS'] ?? '90');
const runtimeUrl = process.env['RUNTIME_WORKER_URL'] ?? 'http://localhost:8000/api/v1/execute';
const runtimeSecret = process.env['API_INTERNAL_SECRET'] ?? 'dev-secret';

let ready = false;

async function start() {
  const redis = createRedisConnection(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  await redis.ping();
  await db.execute(sql`select 1`);
  ready = true;
  startHeartbeat(db, workerId);

  const worker = createWorker<DispatchPayload>(QUEUES.EXECUTION_DISPATCH, async (job) => {
    await processExecutionDispatchJob(job.data, {
      workerId,
      leaseSeconds,
      invokeRuntime: async (payload) => {
        await invokeRuntimeHttp(runtimeUrl, runtimeSecret, payload);
      },
    });
  }, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379', concurrency: Number(process.env['WORKER_CONCURRENCY'] ?? '5') });

  const server = createServer(async (req, res) => {
    if (req.url === '/health/live') { res.statusCode = 200; res.end('ok'); return; }
    if (req.url === '/health/ready') {
      try {
        await redis.ping();
        await db.execute(sql`select 1`);
        const q = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379' });
        await q.getWaitingCount();
        await q.close();
        if ((process.env['RUNTIME_HEALTH_REQUIRED'] ?? 'false') === 'true') {
          const rr = await fetch((process.env['RUNTIME_WORKER_HEALTH_URL'] ?? 'http://localhost:8000/health/ready'));
          if (!rr.ok) throw new Error('runtime_not_ready');
        }
        res.statusCode = ready ? 200 : 503; res.end(ready ? 'ready' : 'booting');
      } catch { res.statusCode = 503; res.end('not_ready'); }
      return;
    }
    res.statusCode = 404; res.end('not_found');
  });
  server.listen(3003);

  const shutdown = async () => { ready = false; stopHeartbeat(); await worker.close(); await redis.quit(); server.close(); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

start().catch((e) => { console.error('scheduler_start_failed', e); process.exit(1); });
