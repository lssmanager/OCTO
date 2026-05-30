import { randomUUID } from 'node:crypto';

import { and, eq } from 'drizzle-orm';
import { executionSteps, executions, insertOutboxEvent, withTenantTx } from '@octo/database';
import { ConcurrentTransitionError, createDrizzleExecutionStateService } from '@octo/runtime-state';

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
  deps: {
    workerId: string;
    leaseSeconds: number;
    invokeRuntime: (payload: RuntimePayload) => Promise<void>;
  }
): Promise<'dispatched' | 'reinvoked' | 'skipped'> {
  if (!data.executionId || !data.tenantId) throw new Error('invalid_dispatch_payload');

  const mode = resolveMode(data);
  const dispatchReason: DispatchReason =
    data.reason ?? (mode === 'reclaim' ? 'reclaim_replay' : 'dispatch');

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

    if (skippedStatus === 'dispatched') {
      return {
        agentId: current.agentId as string,
        traceId: String(current.traceId || data.traceId || randomUUID()),
        alreadyDispatched: true,
      };
    }

    const dispatchableStatus = mode === 'reclaim' ? 'reclaimable' : 'queued';
    const nextAttempt =
      mode === 'reclaim'
        ? Math.max(Number(current.attempt ?? 0) + 1, Number(data.attempt ?? 0))
        : Number(current.attempt ?? 0);
    const now = new Date();
    const lease = new Date(now.getTime() + deps.leaseSeconds * 1000);
    const traceId = String(current.traceId || data.traceId || randomUUID());

    const stateService = createDrizzleExecutionStateService({
      tenantId: data.tenantId,
      traceId,
      runId: String(current.runId),
      agentId: String(current.agentId),
      source: 'scheduler-worker',
      rowPatch: {
        leaseOwner: deps.workerId,
        workerId: deps.workerId,
        leaseExpiresAt: lease,
        attempt: nextAttempt,
        attemptCount: nextAttempt,
        updatedAt: now,
      },
      eventMetadata: {
        workerId: deps.workerId,
        mode,
        reason: dispatchReason,
      },
    });

    try {
      await stateService.transition(tx, data.executionId, dispatchableStatus, 'dispatched', {
        workerId: deps.workerId,
        stepName: 'dispatch',
        stepPayload: { reason: dispatchReason, mode },
      });
    } catch (error) {
      if (error instanceof ConcurrentTransitionError) {
        return false;
      }
      throw error;
    }

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

    return {
      agentId: current.agentId as string,
      traceId,
      alreadyDispatched: false,
    };
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
      traceId: transitioned.traceId,
      mode,
    });
    if (mode === 'reclaim') {
      replayedCounter.add(1, { executionId: data.executionId });
    }
    return transitioned.alreadyDispatched ? 'reinvoked' : 'dispatched';
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
