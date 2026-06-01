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
  correlationId?: string;
  runId?: string;
  queueJobId?: string;
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
  correlationId: string;
  runId: string;
  queueJobId: string;
  mode?: DispatchMode;
  reason: DispatchReason;
  leaseOwner: string;
  leaseToken: string;
  attempt: number;
};

function logJson(msg: string, fields: Record<string, unknown>): void {
  console.log(JSON.stringify({ msg, ...fields }));
}

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
  const correlationId = data.correlationId ?? data.traceId ?? data.executionId;
  const runId = data.runId ?? data.executionId;
  const queueJobId = data.queueJobId ?? data.executionId;
  logJson('execution_dispatch_job_received', {
    executionId: data.executionId, tenantId: data.tenantId, agentId: data.agentId,
    traceId: data.traceId, correlationId, runId, queueJobId, workerId: deps.workerId, mode, attempt: data.attempt,
  });
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

    if (data.agentId && data.agentId !== current.agentId) throw new Error('dispatch_tenant_agent_mismatch');

    skippedStatus = String(current.status);
    if (['completed', 'failed', 'cancelled'].includes(skippedStatus)) return false;

    if (skippedStatus === 'dispatched') {
      if (!current.leaseToken || !current.leaseOwner) {
        logJson('execution_dispatch_reinvoke_without_lease_skipped', {
          executionId: data.executionId,
          tenantId: data.tenantId,
          mode,
        });
        return false;
      }
      return {
        agentId: current.agentId as string,
        traceId: String(current.traceId || data.traceId || randomUUID()),
        correlationId,
        runId: String(current.runId || runId),
        queueJobId,
        leaseOwner: String(current.leaseOwner),
        leaseToken: String(current.leaseToken),
        attempt: Number(current.attempt ?? data.attempt ?? 1),
        alreadyDispatched: true,
      };
    }

    const dispatchableStatus = mode === 'reclaim' ? 'reclaimable' : 'queued';
    const nextAttempt =
      mode === 'reclaim'
        ? Math.max(Number(current.attempt ?? 0) + 1, Number(data.attempt ?? 0))
        : Math.max(Number(current.attempt ?? 0), Number(data.attempt ?? 1));
    const leaseToken = randomUUID();
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
        leaseToken,
        attempt: nextAttempt,
        attemptCount: nextAttempt,
        updatedAt: now,
      },
      eventMetadata: {
        workerId: deps.workerId,
        mode,
        reason: dispatchReason,
        leaseToken,
        attempt: nextAttempt,
        leaseOwner: deps.workerId,
        correlationId,
        runId: String(current.runId || runId),
        queueJobId,
      },
    });

    try {
      await stateService.transition(tx, data.executionId, dispatchableStatus, 'dispatched', {
        workerId: deps.workerId,
        stepName: 'dispatch',
        stepPayload: { reason: dispatchReason, mode, leaseToken, attempt: nextAttempt },
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
      inputJson: { reason: dispatchReason, mode, attempt: nextAttempt },
      outputJson: { workerId: deps.workerId, leaseToken },
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
        leaseOwner: deps.workerId,
        leaseToken,
      },
      traceId: traceId,
      correlationId,
      runId: String(current.runId || runId),
      source: 'scheduler-worker',
    });

    return {
      agentId: current.agentId as string,
      traceId,
      correlationId,
      runId: String(current.runId || runId),
      queueJobId,
      leaseOwner: deps.workerId,
      leaseToken,
      attempt: nextAttempt,
      alreadyDispatched: false,
    };
  });

  if (!transitioned) {
    if (mode === 'reclaim') {
      dispatchSkippedCounter.add(1, { executionId: data.executionId, status: skippedStatus });
    }
    logJson('execution_dispatch_skipped', { executionId: data.executionId, tenantId: data.tenantId, traceId: data.traceId, correlationId, runId, queueJobId, workerId: deps.workerId, status: skippedStatus, mode });
    return 'skipped';
  }

  try {
    logJson('execution_runtime_invocation_started', { executionId: data.executionId, tenantId: data.tenantId, agentId: transitioned.agentId, traceId: transitioned.traceId, correlationId: transitioned.correlationId, runId: transitioned.runId, queueJobId: transitioned.queueJobId, workerId: deps.workerId, mode, attempt: transitioned.attempt, leaseOwner: transitioned.leaseOwner });
    await deps.invokeRuntime({
      executionId: data.executionId,
      tenantId: data.tenantId,
      agentId: transitioned.agentId,
      traceId: transitioned.traceId,
      correlationId: transitioned.correlationId,
      runId: transitioned.runId,
      queueJobId: transitioned.queueJobId,
      mode,
      reason: dispatchReason,
      leaseOwner: transitioned.leaseOwner,
      leaseToken: transitioned.leaseToken,
      attempt: transitioned.attempt,
    });
    logJson('execution_runtime_invocation_accepted', { executionId: data.executionId, tenantId: data.tenantId, traceId: transitioned.traceId, correlationId: transitioned.correlationId, runId: transitioned.runId, queueJobId: transitioned.queueJobId, workerId: deps.workerId, mode, attempt: transitioned.attempt });
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
    logJson('execution_runtime_invocation_failed', { executionId: data.executionId, tenantId: data.tenantId, traceId: data.traceId, correlationId, runId, queueJobId, workerId: deps.workerId, mode, error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}
