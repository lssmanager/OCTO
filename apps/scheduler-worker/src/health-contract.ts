import type { IncomingMessage } from 'node:http';

export interface SchedulerDispatchRepairStatus {
  lastRunAt: string | null;
  staleQueuedCount: number;
  oldestStaleQueuedAgeMs: number | null;
  repaired: number;
  alreadyPresent: number;
  lastError: string | null;
}

export interface SchedulerOperationalStatus {
  workerId: string;
  topology: {
    dispatchConsumer: string;
    dispatchRepair: string;
    runtimeInvocation: string;
    runtimeInvokeTimeoutMs: number;
    leaseSeconds: number;
  };
  executionDispatch: {
    staleThresholdMs: number;
    intervalMs: number;
  } & SchedulerDispatchRepairStatus;
}

export function schedulerPublicProbeBody(isReady: boolean): string {
  return isReady ? 'ready' : 'not_ready';
}

export function schedulerInternalSecret(): string {
  const secret = process.env['INTERNAL_SECRET'];
  if (!secret || secret.length < 32) {
    throw new Error('INTERNAL_SECRET must be set and at least 32 characters long');
  }
  return secret;
}

export function isAuthorizedSchedulerOpsRequest(req: IncomingMessage): boolean {
  const rawSecret = req.headers['x-internal-secret'];
  const providedSecret = Array.isArray(rawSecret) ? rawSecret[0] : rawSecret;
  return providedSecret === schedulerInternalSecret();
}

export function buildSchedulerOperationalStatus(input: {
  workerId: string;
  runtimeInvokeTimeoutMs: number;
  leaseSeconds: number;
  dispatchReconcilerStaleMs: number;
  dispatchReconcilerIntervalMs: number;
  dispatchRepairStatus: SchedulerDispatchRepairStatus;
}): SchedulerOperationalStatus {
  return {
    workerId: input.workerId,
    topology: {
      dispatchConsumer: 'scheduler-worker',
      dispatchRepair: 'queued-dispatch-reconciler',
      runtimeInvocation: 'scheduler-http-runtime-202-accepted',
      runtimeInvokeTimeoutMs: input.runtimeInvokeTimeoutMs,
      leaseSeconds: input.leaseSeconds,
    },
    executionDispatch: {
      staleThresholdMs: input.dispatchReconcilerStaleMs,
      intervalMs: input.dispatchReconcilerIntervalMs,
      ...input.dispatchRepairStatus,
    },
  };
}
