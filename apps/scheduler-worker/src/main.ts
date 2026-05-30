import { and, asc, eq, lt, sql } from 'drizzle-orm';
import { createServer } from 'node:http';
import { createWorker, QUEUES, createRedisConnection, createQueue } from '@octo/queue';
import { db, executions } from '@octo/database';
import { processExecutionDispatchJob, type DispatchPayload } from './dispatch-handler';
import { invokeRuntimeHttp } from './runtime-client';
import { startHeartbeat, stopHeartbeat } from './heartbeat';
import { reconcileQueuedDispatchGaps } from './reconciliation/execution-reconciler';

const workerId = process.env['SCHEDULER_WORKER_ID'] ?? `scheduler-${process.pid}`;
const leaseSeconds = Number(process.env['EXECUTION_LEASE_SECONDS'] ?? '90');
const runtimeUrl = process.env['RUNTIME_WORKER_URL'] ?? 'http://localhost:8000/api/v1/execute';
const runtimeSecret = process.env['API_INTERNAL_SECRET'] ?? 'dev-secret';
const redisUrl = process.env['REDIS_URL'] ?? 'redis://localhost:6379';
const dispatchReconcilerIntervalMs = Number(process.env['EXECUTION_DISPATCH_RECONCILER_INTERVAL_MS'] ?? '30000');
const dispatchReconcilerStaleMs = Number(process.env['EXECUTION_DISPATCH_RECONCILER_STALE_MS'] ?? '15000');
const dispatchReconcilerBatchSize = Number(process.env['EXECUTION_DISPATCH_RECONCILER_BATCH_SIZE'] ?? '100');
const activeDispatchStates = new Set(['waiting', 'active', 'delayed', 'prioritized', 'waiting-children']);
const terminalDispatchStates = new Set(['completed', 'failed']);

let ready = false;
let dispatchReconcilerTimer: NodeJS.Timeout | null = null;
let dispatchRepairStatus: {
  lastRunAt: string | null;
  staleQueuedCount: number;
  oldestStaleQueuedAgeMs: number | null;
  repaired: number;
  alreadyPresent: number;
  lastError: string | null;
} = {
  lastRunAt: null,
  staleQueuedCount: 0,
  oldestStaleQueuedAgeMs: null,
  repaired: 0,
  alreadyPresent: 0,
  lastError: null,
};

async function start() {
  const redis = createRedisConnection(redisUrl);
  const dispatchQueue = createQueue<DispatchPayload>(QUEUES.EXECUTION_DISPATCH, { redisUrl });

  await redis.ping();
  await db.execute(sql`select 1`);
  ready = true;
  startHeartbeat(db, workerId);

  const runDispatchReconciliation = async () => {
    try {
      const result = await reconcileQueuedDispatchGaps(
        {
          findQueuedDispatchGaps: async (staleBefore, batchSize) => {
            return db
              .select({
                id: executions.id,
                tenantId: executions.tenantId,
                agentId: executions.agentId,
                traceId: executions.traceId,
                queueJobId: executions.queueJobId,
                createdAt: executions.createdAt,
                updatedAt: executions.updatedAt,
              })
              .from(executions)
              .where(and(eq(executions.status, 'queued'), lt(executions.updatedAt, staleBefore)))
              .orderBy(asc(executions.updatedAt))
              .limit(batchSize);
          },
          ensureDispatchJob: async (gap) => {
            const jobId = gap.queueJobId ?? gap.id;
            const existing = await dispatchQueue.getJob(jobId);
            if (existing) {
              const state = await existing.getState();
              if (activeDispatchStates.has(state)) {
                return 'already_present';
              }
              if (terminalDispatchStates.has(state)) {
                await existing.remove();
              } else {
                return 'already_present';
              }
            }

            await dispatchQueue.add(
              'dispatch',
              {
                executionId: gap.id,
                tenantId: gap.tenantId,
                agentId: gap.agentId,
                traceId: gap.traceId || undefined,
                expectedState: 'queued',
              },
              { jobId }
            );
            return 'enqueued';
          },
        },
        {
          staleMs: dispatchReconcilerStaleMs,
          batchSize: dispatchReconcilerBatchSize,
        }
      );

      dispatchRepairStatus = {
        lastRunAt: result.checkedAt.toISOString(),
        staleQueuedCount: result.staleQueuedCount,
        oldestStaleQueuedAgeMs: result.oldestStaleQueuedAgeMs,
        repaired: result.repaired,
        alreadyPresent: result.alreadyPresent,
        lastError: null,
      };
    } catch (error) {
      dispatchRepairStatus = {
        ...dispatchRepairStatus,
        lastRunAt: new Date().toISOString(),
        lastError: error instanceof Error ? error.message : String(error),
      };
      console.error('execution_dispatch_reconciliation_failed', error);
    } finally {
      dispatchReconcilerTimer = setTimeout(() => void runDispatchReconciliation(), dispatchReconcilerIntervalMs);
    }
  };

  void runDispatchReconciliation();

  const worker = createWorker<DispatchPayload>(QUEUES.EXECUTION_DISPATCH, async (job) => {
    await processExecutionDispatchJob(job.data, {
      workerId,
      leaseSeconds,
      invokeRuntime: async (payload) => {
        await invokeRuntimeHttp(runtimeUrl, runtimeSecret, payload);
      },
    });
  }, { redisUrl, concurrency: Number(process.env['WORKER_CONCURRENCY'] ?? '5') });

  const server = createServer(async (req, res) => {
    if (req.url === '/health/live') { res.statusCode = 200; res.end('ok'); return; }
    if (req.url === '/health/ready') {
      try {
        await redis.ping();
        await db.execute(sql`select 1`);
        await dispatchQueue.getWaitingCount();
        if ((process.env['RUNTIME_HEALTH_REQUIRED'] ?? 'false') === 'true') {
          const rr = await fetch((process.env['RUNTIME_WORKER_HEALTH_URL'] ?? 'http://localhost:8000/health/ready'));
          if (!rr.ok) throw new Error('runtime_not_ready');
        }
        res.statusCode = ready ? 200 : 503; res.end(ready ? 'ready' : 'booting');
      } catch { res.statusCode = 503; res.end('not_ready'); }
      return;
    }
    if (req.url === '/health/status') {
      res.statusCode = 200;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({
        workerId,
        topology: {
          dispatchConsumer: 'scheduler-worker',
          dispatchRepair: 'queued-dispatch-reconciler',
          runtimeInvocation: 'scheduler-http-runtime',
        },
        executionDispatch: {
          staleThresholdMs: dispatchReconcilerStaleMs,
          intervalMs: dispatchReconcilerIntervalMs,
          ...dispatchRepairStatus,
        },
      }));
      return;
    }
    res.statusCode = 404; res.end('not_found');
  });
  server.listen(3003);

  const shutdown = async () => {
    ready = false;
    stopHeartbeat();
    if (dispatchReconcilerTimer) {
      clearTimeout(dispatchReconcilerTimer);
      dispatchReconcilerTimer = null;
    }
    await worker.close();
    await dispatchQueue.close();
    await redis.quit();
    server.close();
    process.exit(0);
  };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

start().catch((e) => { console.error('scheduler_start_failed', e); process.exit(1); });
