import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { createWorker, QUEUES, createRedisConnection } from '@octo/queue';
import { db, executions, executionSteps, outboxEvents, withTenantTx } from '@octo/database';

type DispatchPayload = { executionId: string; tenantId: string; agentId?: string; traceId?: string; expectedState?: string; expectedVersion?: number };
const workerId = process.env['SCHEDULER_WORKER_ID'] ?? `scheduler-${process.pid}`;
const leaseSeconds = Number(process.env['EXECUTION_LEASE_SECONDS'] ?? '90');
const runtimeUrl = process.env['RUNTIME_WORKER_URL'] ?? 'http://localhost:8000/api/v1/execute/internal';
const runtimeSecret = process.env['API_INTERNAL_SECRET'] ?? 'dev-secret';

let ready = false;

async function processDispatch(data: DispatchPayload): Promise<void> {
  if (!data.executionId || !data.tenantId) throw new Error('invalid_dispatch_payload');
  const transitioned = await withTenantTx(data.tenantId, async (tx) => {
    const current = await tx.select().from(executions).where(and(eq(executions.id, data.executionId), eq(executions.tenantId, data.tenantId))).limit(1);
    const row = current[0];
    if (!row) throw new Error('execution_not_found');
    if (['SUCCEEDED','FAILED','CANCELLED'].includes(String(row.state))) return false;
    const now = new Date();
    const lease = new Date(now.getTime() + leaseSeconds * 1000);
    const updated = await tx.update(executions).set({ state: 'DISPATCHED', status: 'dispatched', leaseOwner: workerId, leaseExpiresAt: lease, version: sql`${executions.version} + 1`, updatedAt: now }).where(and(eq(executions.id, data.executionId), eq(executions.tenantId, data.tenantId), eq(executions.state, 'QUEUED'))).returning({ version: executions.version, inputJson: executions.inputJson, agentId: executions.agentId });
    if (!updated.length) return false;
    await tx.insert(executionSteps).values({ id: randomUUID(), tenantId: data.tenantId, executionId: data.executionId, stepIndex: 0, stepType: 'reasoning', status: 'RUNNING', stateFrom: 'QUEUED', stateTo: 'DISPATCHED', inputJson: { reason: 'dispatch' }, outputJson: { leaseOwner: workerId } });
    await tx.insert(outboxEvents).values({ id: randomUUID(), tenantId: data.tenantId, aggregateType: 'execution', aggregateId: data.executionId, eventType: 'ExecutionDispatched', sequence: 2, payloadJson: { executionId: data.executionId, workerId } });
    return updated[0];
  });

  if (!transitioned) return;
  await fetch(runtimeUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-internal-secret': runtimeSecret }, body: JSON.stringify({ executionId: data.executionId, tenantId: data.tenantId, traceId: data.traceId ?? randomUUID() }) });
}

async function start() {
  const redis = createRedisConnection(process.env['REDIS_URL'] ?? 'redis://localhost:6379');
  await redis.ping();
  await db.execute(sql`select 1`);
  ready = true;

  const worker = createWorker<DispatchPayload>(QUEUES.EXECUTION_DISPATCH, async (job) => {
    await processDispatch(job.data);
  }, { redisUrl: process.env['REDIS_URL'] ?? 'redis://localhost:6379', concurrency: Number(process.env['WORKER_CONCURRENCY'] ?? '5') });

  const server = createServer(async (req, res) => {
    if (req.url === '/health/live') { res.statusCode = 200; res.end('ok'); return; }
    if (req.url === '/health/ready') {
      try { await redis.ping(); await db.execute(sql`select 1`); res.statusCode = ready ? 200 : 503; res.end(ready ? 'ready' : 'booting'); } catch { res.statusCode = 503; res.end('not_ready'); }
      return;
    }
    res.statusCode = 404; res.end('not_found');
  });
  server.listen(3003);

  const shutdown = async () => { ready = false; await worker.close(); await redis.quit(); server.close(); process.exit(0); };
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
}

start().catch((e) => { console.error('scheduler_start_failed', e); process.exit(1); });
