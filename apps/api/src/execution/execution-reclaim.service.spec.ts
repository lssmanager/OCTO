import { describe, expect, it, vi } from 'vitest';
import { ExecutionReclaimService, type StaleExecutionRow } from './execution-reclaim.service';

const baseExecution: StaleExecutionRow = {
  id: 'exec-1',
  tenantId: 'tenant-1',
  state: 'RUNNING',
  version: 1,
  reclaimCount: 0,
  leaseOwner: 'worker-1',
  leaseExpiresAt: new Date('2026-01-01T00:00:00Z'),
};

function makeService(overrides?: Partial<{ stale: StaleExecutionRow[]; casReclaim: boolean; casDlq: boolean }>) {
  const repo = {
    findStaleLeases: vi.fn(async () => overrides?.stale ?? [baseExecution]),
    casReclaiming: vi.fn(async () => overrides?.casReclaim ?? true),
    casRouteToDlq: vi.fn(async () => overrides?.casDlq ?? true),
  };
  const queue = { add: vi.fn(async () => undefined) };
  return { service: new ExecutionReclaimService(repo, queue), repo, queue };
}

describe('ExecutionReclaimService', () => {
  it('scanStaleLeases detects stale RUNNING', async () => {
    const { service, repo } = makeService({ stale: [{ ...baseExecution, state: 'RUNNING' }] });
    await service.scanStaleLeases();
    expect(repo.findStaleLeases).toHaveBeenCalled();
  });

  it('scanStaleLeases detects stale DISPATCHED', async () => {
    const { service, repo } = makeService({ stale: [{ ...baseExecution, state: 'DISPATCHED' }] });
    await service.scanStaleLeases();
    expect(repo.findStaleLeases).toHaveBeenCalled();
  });

  it('scanStaleLeases ignores fresh leases', async () => {
    const { service, queue } = makeService({ stale: [] });
    await service.scanStaleLeases();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('scanStaleLeases ignores terminal states', async () => {
    const { service, queue } = makeService({ stale: [{ ...baseExecution, state: 'SUCCEEDED' }] });
    await service.scanStaleLeases();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('reclaimExecution performs CAS to RECLAIMING', async () => {
    const { service, repo } = makeService();
    await service.reclaimExecution(baseExecution);
    expect(repo.casReclaiming).toHaveBeenCalled();
  });

  it('reclaimExecution CAS conflict is no-op', async () => {
    const { service, queue } = makeService({ casReclaim: false });
    const result = await service.reclaimExecution(baseExecution);
    expect(result).toBe('noop');
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('reclaimExecution increments reclaimCount and enqueues deterministic jobId', async () => {
    const { service, queue } = makeService();
    await service.reclaimExecution({ ...baseExecution, reclaimCount: 1 });
    expect(queue.add).toHaveBeenCalledWith(
      'execution.reclaim',
      expect.objectContaining({ reclaimCount: 2 }),
      expect.objectContaining({ jobId: 'reclaim:exec-1:2', priority: 1 })
    );
  });

  it('max reclaims routes to DLQ', async () => {
    const { service, repo, queue } = makeService();
    const result = await service.reclaimExecution({ ...baseExecution, reclaimCount: 3 });
    expect(result).toBe('dlq');
    expect(repo.casRouteToDlq).toHaveBeenCalled();
    expect(queue.add).not.toHaveBeenCalled();
  });

  it('DLQ routing does not mutate terminal execution', async () => {
    const { service, repo } = makeService();
    const result = await service.routeToDLQ({ ...baseExecution, state: 'FAILED' });
    expect(result).toBe('noop');
    expect(repo.casRouteToDlq).not.toHaveBeenCalled();
  });
});
