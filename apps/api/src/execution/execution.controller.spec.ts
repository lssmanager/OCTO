import { describe, expect, it, vi } from 'vitest';
import { ExecutionController } from './execution.controller';

describe('ExecutionController', () => {
  it('routes tenant-scoped calls to service', async () => {
    const service = {
      create: vi.fn(async () => ({ id: 'exec-1' })),
      getSummary: vi.fn(async () => ({ id: 'exec-1' })),
      getTimeline: vi.fn(async () => []),
      cancel: vi.fn(async () => ({ accepted: true })),
      resume: vi.fn(async () => ({ accepted: true })),
    } as any;
    const controller = new ExecutionController(service);
    await controller.create(
      { agentId: 'a1', agentVersionId: 'v1', input: {} },
      { user: { tenantId: 'tenant-1', sub: 'user-1' } }
    );
    await controller.getSummary('exec-1', {
      user: { tenantId: 'tenant-1', sub: 'user-1' },
    });
    await controller.getTimeline('exec-1', {
      user: { tenantId: 'tenant-1', sub: 'user-1' },
    });
    await controller.cancel('exec-1', { user: { tenantId: 'tenant-1', sub: 'user-1' } });
    await controller.resume('exec-1', { user: { tenantId: 'tenant-1', sub: 'user-1' } });
    expect(service.create).toHaveBeenCalledWith(expect.anything(), 'tenant-1', 'user-1');
    expect(service.getSummary).toHaveBeenCalledWith('exec-1', 'tenant-1');
    expect(service.getTimeline).toHaveBeenCalledWith('exec-1', 'tenant-1');
    expect(service.cancel).toHaveBeenCalledWith('exec-1', 'tenant-1');
    expect(service.resume).toHaveBeenCalledWith('exec-1', 'tenant-1');
  });

  it('rejects missing principal', async () => {
    const service = { create: vi.fn() } as any;
    const controller = new ExecutionController(service);
    expect(() =>
      controller.create({ agentId: 'a1', agentVersionId: 'v1', input: {} }, {})
    ).toThrow();
  });
});
