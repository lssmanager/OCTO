import crypto from 'node:crypto';

import { and, eq, lt, or, sql } from 'drizzle-orm';
import { executionDlq, executions, getDb, insertOutboxEvent, withTenantTx } from '@octo/database';
import { createQueue, QUEUES } from '@octo/queue';

import { casReclaim } from './cas-reclaim';
import {
  failedTerminalCounter,
  reclaimedCounter,
  reclaimErrorCounter,
  requeuedCounter,
  skippedCounter,
} from './metrics';

interface LoopConfig {
  intervalMs: number;
  leaseTimeoutMs: number;
  maxReclaimAttempts: number;
}

type ReclaimCandidate = {
  id: string;
  tenantId: string;
  agentId: string;
  status: string;
  attempt: number | null;
  reclaimCount: number | null;
  traceId: string | null;
  runId: string | null;
  leaseToken: string | null;
  queueJobId: string | null;
};

type ReclaimDispatchPayload = {
  executionId: string;
  tenantId: string;
  agentId: string;
  traceId: string;
  reason: 'reclaim_replay';
  mode: 'reclaim';
  attempt: number;
};

let timer: NodeJS.Timeout | null = null;

function buildReclaimDispatchPayload(candidate: ReclaimCandidate): ReclaimDispatchPayload {
  const nextAttempt = Number(candidate.attempt ?? 0) + 1;
  return {
    executionId: candidate.id,
    tenantId: candidate.tenantId,
    agentId: candidate.agentId,
    traceId: candidate.traceId ?? `reclaim-${candidate.id}`,
    reason: 'reclaim_replay',
    mode: 'reclaim',
    attempt: nextAttempt,
  };
}

async function failReclaimTerminally(
  _db: ReturnType<typeof getDb>,
  candidate: ReclaimCandidate,
  errorCode: string,
  errorMessage: string
): Promise<void> {
  await withTenantTx(candidate.tenantId, async (tx) => {
    const updated = await tx
      .update(executions)
      .set({
        status: 'failed',
        state: 'failed',
        errorCode,
        errorMessage,
        error: {
          code: errorCode,
          message: errorMessage,
          retryable: false,
        },
        completedAt: new Date(),
        updatedAt: new Date(),
        leaseOwner: null,
        leaseToken: null,
        workerId: null,
        leaseExpiresAt: null,
      })
      .where(
        and(
          eq(executions.id, candidate.id),
          eq(executions.tenantId, candidate.tenantId),
          sql`${executions.status} IN ('running', 'reclaimable')`
        )
      )
      .returning({ id: executions.id });

    if (!updated.length) return;

    await tx.insert(executionDlq).values({
      id: crypto.randomUUID(),
      executionId: candidate.id,
      tenantId: candidate.tenantId,
      reason: 'reclaim_max_attempts_exceeded',
      attemptsMade: Number(candidate.attempt ?? 0),
      lastError: { code: errorCode, message: errorMessage, retryable: false },
      errorChain: [{ code: errorCode, message: errorMessage, at: new Date().toISOString() }],
      failureContext: {
        reason: 'RECLAIM_MAX_ATTEMPTS_EXCEEDED',
        reclaimCount: candidate.reclaimCount ?? 0,
        attempt: candidate.attempt ?? 0,
        leaseToken: candidate.leaseToken,
      },
      queueName: 'execution.dispatch',
      queueJobId: candidate.queueJobId ?? candidate.id,
      traceId: candidate.traceId,
      runId: candidate.runId,
      quarantine: true,
      firstFailureAt: new Date(),
      lastFailureAt: new Date(),
      retryAfter: null,
      payloadJson: {
        executionId: candidate.id,
        tenantId: candidate.tenantId,
        agentId: candidate.agentId,
      },
    });

    await insertOutboxEvent(tx, {
      tenantId: candidate.tenantId,
      aggregateType: 'execution',
      aggregateId: candidate.id,
      eventType: 'ExecutionFailed',
      payloadJson: {
        executionId: candidate.id,
        errorCode,
        errorMessage,
      },
      traceId: candidate.traceId,
      source: 'reclaimer-worker',
    });
  });
}

export async function processReclaimCandidate(
  db: ReturnType<typeof getDb>,
  dispatchQueue: ReturnType<typeof createQueue>,
  candidate: ReclaimCandidate,
  maxReclaimAttempts: number
): Promise<'requeued' | 'skipped' | 'failed_terminal'> {
  if (!candidate.tenantId) throw new Error('invalid_reclaim_payload');

  const current = await withTenantTx(candidate.tenantId, async (tx) => {
    return (
      await tx
        .select({
          id: executions.id,
          tenantId: executions.tenantId,
          agentId: executions.agentId,
          status: executions.status,
          attempt: executions.attempt,
          reclaimCount: executions.reclaimCount,
          traceId: executions.traceId,
          runId: executions.runId,
          leaseToken: executions.leaseToken,
          queueJobId: executions.queueJobId,
        })
        .from(executions)
        .where(and(eq(executions.id, candidate.id), eq(executions.tenantId, candidate.tenantId)))
        .limit(1)
    )[0] as ReclaimCandidate | undefined;
  });
  if (!current || current.agentId !== candidate.agentId) {
    skippedCounter.add(1, { executionId: candidate.id, outcome: 'tenant_mismatch' });
    return 'skipped';
  }
  candidate = { ...candidate, ...current };

  if (Number(candidate.reclaimCount ?? 0) >= maxReclaimAttempts) {
    await failReclaimTerminally(
      db,
      candidate,
      'RECLAIM_MAX_ATTEMPTS_EXCEEDED',
      `reclaim attempts exceeded (${maxReclaimAttempts})`
    );
    failedTerminalCounter.add(1, { executionId: candidate.id });
    return 'failed_terminal';
  }

  if (candidate.status === 'running') {
    const outcome = await casReclaim(
      db,
      candidate.id,
      candidate.tenantId,
      {
        ...(candidate.traceId ? { correlationId: candidate.traceId } : {}),
      },
      { attempt: candidate.attempt, leaseToken: candidate.leaseToken }
    );

    if (outcome !== 'reclaimed') {
      skippedCounter.add(1, { executionId: candidate.id, outcome });
      return 'skipped';
    }

    reclaimedCounter.add(1, { executionId: candidate.id });
  }

  const payload = buildReclaimDispatchPayload(candidate);
  await dispatchQueue.add(QUEUES.EXECUTION_DISPATCH, payload, {
    jobId: `reclaim:${candidate.id}:${payload.attempt}`,
    attempts: 1,
  });

  requeuedCounter.add(1, { executionId: candidate.id, attempt: payload.attempt });
  return 'requeued';
}

export async function startReclaimLoop(
  db: ReturnType<typeof getDb>,
  redisUrl: string,
  config: LoopConfig
): Promise<void> {
  const dispatchQueue = createQueue(QUEUES.EXECUTION_DISPATCH, { redisUrl });

  const tick = async () => {
    try {
      const zombies = await db
        .select({
          id: executions.id,
          tenantId: executions.tenantId,
          agentId: executions.agentId,
          status: executions.status,
          attempt: executions.attempt,
          reclaimCount: executions.reclaimCount,
          traceId: executions.traceId,
          runId: executions.runId,
          leaseToken: executions.leaseToken,
          queueJobId: executions.queueJobId,
        })
        .from(executions)
        .where(
          or(
            and(eq(executions.status, 'running'), lt(executions.leaseExpiresAt, sql`NOW()`)),
            eq(executions.status, 'reclaimable')
          )
        );

      for (const zombie of zombies) {
        try {
          const outcome = await processReclaimCandidate(
            db,
            dispatchQueue,
            zombie,
            config.maxReclaimAttempts
          );

          if (outcome === 'requeued') {
            console.log(
              JSON.stringify({
                msg: 'execution_reclaimed_requeued',
                executionId: zombie.id,
                tenantId: zombie.tenantId,
              })
            );
          }
        } catch (err: unknown) {
          reclaimErrorCounter.add(1, { executionId: zombie.id });
          console.error(
            JSON.stringify({
              msg: 'reclaim_error',
              executionId: zombie.id,
              error: String(err),
            })
          );
        }
      }

      if (zombies.length > 0) {
        console.log(JSON.stringify({ msg: 'reclaim_tick_done', scanned: zombies.length }));
      }
    } catch (err: unknown) {
      console.error(JSON.stringify({ msg: 'reclaim_tick_error', error: String(err) }));
    }

    timer = setTimeout(() => void tick(), config.intervalMs);
  };

  timer = setTimeout(() => void tick(), config.intervalMs);
}

export async function stopReclaimLoop(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
}
