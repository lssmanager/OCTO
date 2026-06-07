import { describe, expect, it } from 'vitest';
import {
  buildSchedulerOperationalStatus,
  schedulerPublicProbeBody,
  schedulerInternalSecret,
} from './health-contract';

const SENSITIVE_PUBLIC_TERMS = [
  'topology',
  'lastError',
  'staleQueuedCount',
  'runtimeInvokeTimeoutMs',
  'leaseSeconds',
  'workerId',
];

describe('scheduler health contract', () => {
  it('keeps public probe bodies minimal and non-enumerative', () => {
    expect(schedulerPublicProbeBody(true)).toBe('ready');
    expect(schedulerPublicProbeBody(false)).toBe('not_ready');

    for (const body of [schedulerPublicProbeBody(true), schedulerPublicProbeBody(false)]) {
      expect(SENSITIVE_PUBLIC_TERMS.some((term) => body.includes(term))).toBe(false);
      expect(body).not.toMatch(/\d/);
      expect(() => JSON.parse(body)).toThrow();
    }
  });

  it('builds detailed status only for the authenticated internal surface', () => {
    const status = buildSchedulerOperationalStatus({
      workerId: 'scheduler-1',
      runtimeInvokeTimeoutMs: 10000,
      leaseSeconds: 90,
      dispatchReconcilerStaleMs: 15000,
      dispatchReconcilerIntervalMs: 30000,
      dispatchRepairStatus: {
        lastRunAt: null,
        staleQueuedCount: 0,
        oldestStaleQueuedAgeMs: null,
        repaired: 0,
        alreadyPresent: 0,
        lastError: 'redacted from public probes',
      },
    });

    expect(status.workerId).toBe('scheduler-1');
    expect(status.topology.runtimeInvokeTimeoutMs).toBe(10000);
    expect(status.executionDispatch.lastError).toBe('redacted from public probes');
  });

  it('uses the canonical internal secret source for scheduler ops authorization', () => {
    process.env['INTERNAL_SECRET'] = 'scheduler-secret-scheduler-secret-1234';
    expect(schedulerInternalSecret()).toBe('scheduler-secret-scheduler-secret-1234');
  });
});
