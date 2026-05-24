import { describe, expect, it, vi } from 'vitest';
import { AgentController } from './agent.controller';

describe('AgentController', () => {
  it('propagates tenant/user from principal', async () => {
    const service = {
      create: vi.fn(async () => ({})),
      list: vi.fn(async () => []),
      get: vi.fn(async () => ({})),
      patch: vi.fn(async () => ({})),
      delete: vi.fn(async () => ({ deleted: true })),
      versions: vi.fn(async () => []),
    } as any;
    const c = new AgentController(service);
    const req = { user: { tenantId: 'tenant-1', sub: 'user-1' } };
    await c.create({ name: 'n', role: 'r', goal: 'g' }, req);
    await c.list(req, '25');
    await c.get('a1', req);
    await c.patch('a1', { name: 'x' }, req);
    await c.delete('a1', req);
    await c.versions('a1', req, '10');
    expect(service.create).toHaveBeenCalledWith('tenant-1', 'user-1', expect.anything());
    expect(service.list).toHaveBeenCalledWith('tenant-1', 25);
    expect(service.versions).toHaveBeenCalledWith('tenant-1', 'a1', 10);
  });
});
