import { afterEach, describe, expect, it, vi } from 'vitest';

import { invokeRuntimeHttp, RuntimeInvocationError } from './runtime-client';

const payload = {
  executionId: 'exec-1',
  tenantId: 'tenant-1',
  agentId: 'agent-real',
  traceId: 'trace-1',
};

afterEach(() => {
  vi.restoreAllMocks();
});

describe('invokeRuntimeHttp', () => {
  it('posts to the canonical runtime endpoint with execution agent id', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'completed' }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await invokeRuntimeHttp('http://runtime-worker:8000/api/v1/execute', 'secret', payload);

    expect(fetchMock).toHaveBeenCalledWith(
      'http://runtime-worker:8000/api/v1/execute',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'x-internal-secret': 'secret' }),
        body: expect.stringContaining('"agentId":"agent-real"'),
      })
    );
  });

  it('includes reclaim mode for replay dispatches', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ status: 'completed' }), { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    await invokeRuntimeHttp('http://runtime-worker:8000/api/v1/execute', 'secret', {
      ...payload,
      mode: 'reclaim',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'http://runtime-worker:8000/api/v1/execute',
      expect.objectContaining({
        body: expect.stringContaining('"mode":"reclaim"'),
      })
    );
  });

  it('throws so BullMQ can retry when runtime returns 500', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));

    await expect(
      invokeRuntimeHttp('http://runtime-worker:8000/api/v1/execute', 'secret', payload)
    ).rejects.toBeInstanceOf(RuntimeInvocationError);
  });

  it('throws so BullMQ can retry on network failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('ECONNREFUSED');
      })
    );

    await expect(
      invokeRuntimeHttp('http://bad-runtime:8000/api/v1/execute', 'secret', payload)
    ).rejects.toMatchObject({
      message: 'runtime_network_failed',
    });
  });
});
