/**
 * apps/reclaimer-worker/src/metrics.ts
 * Issue #34 — OTEL counters for reclaim operations
 *
 * Exports singleton counters initialised once at startup.
 * Counter names follow the OCTO observability convention:
 *   octo.reclaimer.<metric>
 */

import { metrics } from '@opentelemetry/api';

let _reclaimedCounter:   ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
let _alreadyTakenCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;
let _reclaimErrorCounter: ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>;

export function initMetrics(): void {
  const meter = metrics.getMeter('octo.reclaimer', '0.1.0');

  _reclaimedCounter    = meter.createCounter('octo.reclaimer.reclaimed', {
    description: 'Number of zombie executions successfully reclaimed',
  });
  _alreadyTakenCounter = meter.createCounter('octo.reclaimer.already_taken', {
    description: 'Number of reclaim attempts lost to CAS race (another reclaimer won)',
  });
  _reclaimErrorCounter = meter.createCounter('octo.reclaimer.errors', {
    description: 'Number of unexpected errors during reclaim operations',
  });
}

export const reclaimedCounter    = new Proxy({} as ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>, {
  get: (_, prop) => (...args: unknown[]) =>
    (_reclaimedCounter as unknown as Record<string, (...a: unknown[]) => unknown>)[prop as string]?.(...args),
});
export const alreadyTakenCounter = new Proxy({} as ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>, {
  get: (_, prop) => (...args: unknown[]) =>
    (_alreadyTakenCounter as unknown as Record<string, (...a: unknown[]) => unknown>)[prop as string]?.(...args),
});
export const reclaimErrorCounter = new Proxy({} as ReturnType<ReturnType<typeof metrics.getMeter>['createCounter']>, {
  get: (_, prop) => (...args: unknown[]) =>
    (_reclaimErrorCounter as unknown as Record<string, (...a: unknown[]) => unknown>)[prop as string]?.(...args),
});
