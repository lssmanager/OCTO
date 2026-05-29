import { randomUUID } from 'node:crypto';

import { and, eq, sql } from 'drizzle-orm';
import { executionSteps, executions, insertOutboxEvent, withTenantTx } from '@octo/database';

import { dispatchSkippedCounter, failedTerminalCounter, replayedCounter } from './dispatch-metrics';

export type DispatchMode = 'normal' | 'reclaim';
export type DispatchReason = 'dispatch' | 'reclaim_replay';

export type DispatchPayload = {
  executionId: string;
  tenantId: string;
  agentId?: string;
  traceId?: string;
  expectedState?: string;
  expectedVersion?: number;
  attempt?: number;
  mode?: DispatchMode;
  reason?: DispatchReason;
};

export type RuntimePayload = {
  executionId: string;
  tenantId: string;
  agentId: string;
  traceId: string;
  mode?: DispatchMode;
};

function resolveMode(data: DispatchPayload): DispatchMode {
  if (data.mode) return data.mode;
  return data.reason === 'reclaim_replay' ? 'reclaim' : 'normal';
}

export async function processExecutionDispatchJob(
  data: DispatchPayload,
  deps: { workerId: string; leaseSeconds: number; invokeRuntime: (payload: RuntimePayload) => Promise<void> }
): Promise<'dispatched' | 'skipped'> {
  if (!data.executionId || !data.tenantId) throw new Error('invalid_dispatch_payload');

  const mode = resolveMode(data);
  const dispatchReason: DispatchReason = data.reason ?? (mode === 'reclaim' ? 'reclaim_replay' : 'dispatch');

  let skippedStatus = 'unknown';
  const transitioned = await withTenantTx(data.tenantId, async (tx) => {
    const current = (
      await tx
        .select()
        .from(executions)
        .where(and(eq(executions.id, data.executionId), eq(executions.tenantId, data.tenantId)))
        .limit(1)
    )[0];
    if (!current) throw new Error('execution_not_found');

    skippedStatus = String(current.status);
    if (['completed', 'failed', 'cancelled'].includes(skippedStatus)) return false;

    const dispatchableStatus = mode === 'reclaim' ? 'reclaimable' : 'queued';
    const nextAttempt =
      mode === 'reclaim' ? Math.max(Number(current.attempt ?? 0) + 1, Number(data.attempt ?? 0)) : Number(current.attempt ?? 0);
    const now = new Date();
    const lease = new Date(now.getTime() + deps.leaseSeconds * 1000);

    const updated = await tx
      .update(executions)
      .set({
        state: 'dispatched',
        status: 'dispatched',
        leaseOwner: deps.workerId,
        workerId: deps.workerId,
        leaseExpiresAt: lease,
        attempt: nextAttempt,
        attemptCount: nextAttempt,
        version: sql`${executions.version} + 1`,
        updatedAt: now,
      })
      .where(
        and(
          eq(executions.id, data.executionId),
          eq(executions.tenantId, data.tenantId),
          eq(executions.status, dispatchableStatus)
        )
      )
      .returning({ id: executions.id });

    if (!updated.length) return false;

    await tx.insert(executionSteps).values({
      id: randomUUID(),
      tenantId: data.tenantId,
      executionId: data.executionId,
      stepIndex: 0,
      stepType: 'reasoning',
      status: 'running',
      stateFrom: dispatchableStatus,
      stateTo: 'dispatched',
      inputJson: { reason: dispatchReason, mode },
      outputJson: { workerId: deps.workerId },
    });

    await insertOutboxEvent(tx, {
      tenantId: data.tenantId,
      aggregateType: 'execution',
      aggregateId: data.executionId,
      eventType: 'ExecutionDispatched',
      payloadJson: {
        executionId: data.executionId,
        workerId: deps.workerId,
        reason: dispatchReason,
        mode,
        attempt: nextAttempt,
      },
      traceId: data.traceId ?? null,
      source: 'scheduler-worker',
    });

    return { agentId: current.agentId as string };
  });

  if (!transitioned) {
    if (mode === 'reclaim') {
      dispatchSkippedCounter.add(1, { executionId: data.executionId, status: skippedStatus });
    }
    return 'skipped';
  }

  try {
    await deps.invokeRuntime({
      executionId: data.executionId,
      tenantId: data.tenantId,
      agentId: data.agentId ?? transitioned.agentId,
      traceId: data.traceId ?? randomUUID(),
      mode,
    });
    if (mode === 'reclaim') {
      replayedCounter.add(1, { executionId: data.executionId });
    }
    return 'dispatched';
  } catch (error) {
    if (mode === 'reclaim') {
      const current = await withTenantTx(data.tenantId, async (tx) => {
        return (
          await tx
            .select({ status: executions.status })
            .from(executions)
            .where(and(eq(executions.id, data.executionId), eq(executions.tenantId, data.tenantId)))
            .limit(1)
        )[0];
      });
      const currentStatus = String(current?.status ?? 'unknown');
      if (['completed', 'failed', 'cancelled'].includes(currentStatus)) {
        failedTerminalCounter.add(1, { executionId: data.executionId, status: currentStatus });
      }
    }
    throw error;
  }
}
