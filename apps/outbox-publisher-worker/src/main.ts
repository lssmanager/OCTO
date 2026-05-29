import { createServer } from 'node:http';
import Redis from 'ioredis';
import { createPostgresOutboxPublisherDb } from '@octo/database';
import {
  OUTBOX_BATCH_SIZE,
  OUTBOX_POLL_INTERVAL_MS,
  createOutboxRedisTransport,
  publishOutboxBatch,
} from '@octo/events';
import {
  metricsRegistry,
  outboxOldestUnpublishedAgeMs,
  outboxPendingTotal,
  outboxPublishDlqTotal,
  outboxPublishFailuresTotal,
  outboxPublishLatencyMs,
} from '@octo/observability';

const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const port = Number(process.env['OUTBOX_PUBLISHER_PORT'] ?? '3010');
const pollIntervalMs = Number(process.env['OUTBOX_POLL_INTERVAL_MS'] ?? OUTBOX_POLL_INTERVAL_MS);
const batchSize = Number(process.env['OUTBOX_BATCH_SIZE'] ?? OUTBOX_BATCH_SIZE);
const maxAttempts = Number(process.env['OUTBOX_MAX_ATTEMPTS'] ?? '10');
const stream = process.env['OUTBOX_STREAM_KEY'] ?? 'octo.events';

let ready = false;
let stopping = false;
let lastError: string | null = null;

const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const db = createPostgresOutboxPublisherDb();
const redisTransport = createOutboxRedisTransport(redis as never);

const metrics = {
  setPendingTotal: (value: number) => outboxPendingTotal.set(value),
  setOldestUnpublishedAgeMs: (value: number) => outboxOldestUnpublishedAgeMs.set(value),
  setDlqTotal: (value: number) => outboxPublishDlqTotal.set(value),
  observePublishLatencyMs: (value: number) => outboxPublishLatencyMs.observe(value),
  observeBatchSize: () => undefined,
  incPublishFailed: () => outboxPublishFailuresTotal.inc(),
  incDlqTotal: () => outboxPublishDlqTotal.inc(),
};

async function publishLoop(): Promise<void> {
  while (!stopping) {
    try {
      await publishOutboxBatch({ db, redis: redisTransport, metrics, batchSize, maxAttempts, stream });
      lastError = null;
      ready = true;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.error('outbox_publisher_tick_failed', { error: lastError });
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }
}

const server = createServer(async (req, res) => {
  if (req.url === '/health/live') {
    res.statusCode = 200;
    res.end('ok');
    return;
  }
  if (req.url === '/health/ready') {
    try {
      await redis.ping();
      await db.pendingCount();
      res.statusCode = ready ? 200 : 503;
      res.end(ready ? 'ready' : 'booting');
    } catch (error) {
      res.statusCode = 503;
      res.end(`not_ready:${error instanceof Error ? error.message : String(error)}`);
    }
    return;
  }
  if (req.url === '/metrics') {
    res.setHeader('Content-Type', metricsRegistry.contentType);
    res.end(await metricsRegistry.metrics());
    return;
  }
  if (req.url === '/status') {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ ready, lastError }));
    return;
  }
  res.statusCode = 404;
  res.end('not_found');
});

async function shutdown(): Promise<void> {
  stopping = true;
  ready = false;
  await redis.quit();
  server.close();
}

process.on('SIGTERM', () => void shutdown().finally(() => process.exit(0)));
process.on('SIGINT', () => void shutdown().finally(() => process.exit(0)));

server.listen(port, () => {
  console.log('outbox_publisher_worker_started', { port, stream, batchSize, pollIntervalMs, maxAttempts });
});

void publishLoop();
