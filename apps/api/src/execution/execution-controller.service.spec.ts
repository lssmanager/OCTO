import { describe, expect, it, vi } from 'vitest';
import { NotFoundException } from '@nestjs/common';
import { ExecutionControllerService } from './execution-controller.service';

function buildService(overrides?: Partial<any>) {
  const repo = {
    createExecution: vi.fn(async () => ({ id: 'exec-1' })),
    getExecutionSummary: vi.fn(async () => ({ id: 'exec-1', tenantId: 'tenant-1', agentId: 'a1', agentVersionId: 'v1', status: 'queued', state: 'PENDING', version: 1, createdAt: new Date(), updatedAt: new Date() })),
    getExecutionTimeline: vi.fn(async () => [{ id: 'evt-1', executionId: 'exec-1', tenantId: 'tenant-1', eventType: 'execution.created', payloadJson: {}, createdAt: new Date() }]),
    casRequestCancellation: vi.fn(async () => true),
    casResumeSuspended: vi.fn(async () => true),
    createOutboxEntry: vi.fn(async () => undefined),
    ...overrides,
  };
  return { service: new ExecutionControllerService(repo), repo };
}

describe('ExecutionControllerService', () => {
  it('creates execution', async () => {
    const { service, repo } = buildService();
    const created = await service.create({ agentId: 'a1', agentVersionId: 'v1', input: {} }, 'tenant-1', 'user-1');
    expect(created.id).toBe('exec-1');
    expect(repo.createExecution).toHaveBeenCalled();
  });

  it('returns summary', async () => {
    const { service } = buildService();
    const summary = await service.getSummary('exec-1', 'tenant-1');
    expect(summary.id).toBe('exec-1');
  });

  it('throws when summary not found', async () => {
    const { service } = buildService({ getExecutionSummary: vi.fn(async () => null) });
    await expect(service.getSummary('exec-404', 'tenant-1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('cancel writes outbox after CAS', async () => {
    const { service, repo } = buildService();
    const result = await service.cancel('exec-1', 'tenant-1');
    expect(result.accepted).toBe(true);
    expect(repo.createOutboxEntry).toHaveBeenCalledWith('exec-1', 'tenant-1', 'cancel');
  });

  it('resume writes outbox after CAS', async () => {
    const { service, repo } = buildService();
    const result = await service.resume('exec-1', 'tenant-1');
    expect(result.accepted).toBe(true);
    expect(repo.createOutboxEntry).toHaveBeenCalledWith('exec-1', 'tenant-1', 'resume');
  });
});
