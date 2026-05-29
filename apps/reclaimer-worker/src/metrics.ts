/**
 * apps/reclaimer-worker/src/metrics.ts
 * Reclaim metrics for zombie recovery and replay handoff.
 */

import { metrics } from '@opentelemetry/api';

let _reclaimedCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
let _requeuedCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
let _skippedCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
let _failedTerminalCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
let _reclaimErrorCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;

export function initMetrics(): void {
  const meter = metrics.getMeter('octo.reclaimer', '0.1.0');

  _reclaimedCounter = meter.createCounter('octo.reclaimer.reclaimed', {
    description: 'Number of zombie executions moved into the reclaim handoff state',
  });
  _requeuedCounter = meter.createCounter('octo.reclaimer.requeued', {
    description: 'Number of reclaimed executions re-enqueued to execution.dispatch',
  });
  _skippedCounter = meter.createCounter('octo.reclaimer.skipped', {
    description: 'Number of reclaim candidates skipped because another worker already handled them',
  });
  _failedTerminalCounter = meter.createCounter('octo.reclaimer.failed_terminal', {
    description: 'Number of reclaim candidates failed terminally before replay',
  });
  _reclaimErrorCounter = meter.createCounter('octo.reclaimer.errors', {
    description: 'Number of unexpected errors during reclaim operations',
  });
}

function proxyCounter(
  getter: () => ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>
) {
  return new Proxy({} as ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>, {
    get:
      (_target, prop) =>
      (...args: unknown[]) =>
        (getter() as unknown as Record<string, (...a: unknown[]) => unknown>)[prop as string]?.(...args),
  });
}

export const reclaimedCounter = proxyCounter(() => _reclaimedCounter);
export const requeuedCounter = proxyCounter(() => _requeuedCounter);
export const skippedCounter = proxyCounter(() => _skippedCounter);
export const failedTerminalCounter = proxyCounter(() => _failedTerminalCounter);
export const reclaimErrorCounter = proxyCounter(() => _reclaimErrorCounter);
