import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST, agentGraphApiUrl, normalizeAgentGraphApiUrl } from './route';

const routeSource = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8');
const originalFetch = globalThis.fetch;

afterEach(() => {
  vi.restoreAllMocks();
  globalThis.fetch = originalFetch;
  delete process.env['OCTO_WEB_CONSOLE_TOKEN'];
  delete process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'];
});

function request(
  method: 'GET' | 'POST',
  init: { cookie?: string; origin?: string; body?: unknown } = {}
) {
  return new NextRequest('https://console.example.test/api/agent-graph', {
    method,
    headers: {
      ...(init.cookie ? { cookie: `octo_console_token=${init.cookie}` } : {}),
      ...(init.origin ? { origin: init.origin } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
    },
    ...(init.body ? { body: JSON.stringify(init.body) } : {}),
  });
}

describe('F1 Agent Graph route URL contract', () => {
  it('uses an API base URL that includes the global /api prefix by default', () => {
    expect(normalizeAgentGraphApiUrl()).toBe('http://localhost:3001/api');
  });

  it('normalizes a trailing slash before appending Agent Graph paths', () => {
    expect(agentGraphApiUrl('/v1/agents/graph', 'https://agents.socialstudies.cloud/api/')).toBe(
      'https://agents.socialstudies.cloud/api/v1/agents/graph'
    );
  });

  it('routes Agent Graph actions to /api/v1/agents targets without duplicating /api', () => {
    const base = normalizeAgentGraphApiUrl('http://localhost:3001/api/');
    expect(agentGraphApiUrl('/v1/agents/graph', base)).toBe(
      'http://localhost:3001/api/v1/agents/graph'
    );
    expect(agentGraphApiUrl('/v1/agents/nodes', base)).toBe(
      'http://localhost:3001/api/v1/agents/nodes'
    );
    expect(agentGraphApiUrl('/v1/agents', base)).toBe('http://localhost:3001/api/v1/agents');
  });

  it('keeps the graph projection uncached so writes are visible immediately', () => {
    expect(routeSource).toContain("cache: 'no-store'");
    expect(routeSource).not.toContain('revalidate: 15');
  });

  it('does not reference browser-public console write secrets', () => {
    expect(routeSource).not.toContain('NEXT_PUBLIC_OCTO_CONSOLE_TOKEN');
    expect(routeSource).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*TOKEN/);
  });
});

describe('F1 Agent Graph route authentication', () => {
  it('rejects unauthenticated graph reads without forwarding the server console token', async () => {
    process.env['OCTO_WEB_CONSOLE_TOKEN'] = 'SERVER_SIDE_CONSOLE_TOKEN';
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await GET(request('GET'));

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error:
        'F1 Agent Graph console reads require an authenticated octo_console_token session cookie.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('forwards authenticated graph reads with only the caller session cookie token', async () => {
    process.env['OCTO_WEB_CONSOLE_TOKEN'] = 'SERVER_SIDE_CONSOLE_TOKEN';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify([{ id: 'node-1' }]), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await GET(request('GET', { cookie: 'CALLER_SESSION_TOKEN' }));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual([{ id: 'node-1' }]);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/agents/graph',
      expect.objectContaining({
        headers: expect.objectContaining({ authorization: 'Bearer CALLER_SESSION_TOKEN' }),
      })
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('SERVER_SIDE_CONSOLE_TOKEN');
  });

  it('rejects unauthenticated writes even when server-token writes are enabled', async () => {
    process.env['OCTO_WEB_CONSOLE_TOKEN'] = 'SERVER_SIDE_CONSOLE_TOKEN';
    process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'] = 'true';
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await POST(
      request('POST', {
        body: { action: 'patchNode', nodeId: 'node-1', body: { name: 'Updated' } },
      })
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error:
        'F1 Agent Graph console writes require an authenticated octo_console_token session cookie.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects unauthenticated destructive delete attempts without using the server-token fallback', async () => {
    process.env['OCTO_WEB_CONSOLE_TOKEN'] = 'SERVER_SIDE_CONSOLE_TOKEN';
    process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'] = 'true';
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await POST(
      request('POST', {
        origin: 'https://console.example.test',
        body: { action: 'deleteAgent', agentId: 'agent-1' },
      })
    );

    expect(res.status).toBe(401);
    await expect(res.json()).resolves.toEqual({
      error:
        'F1 Agent Graph console writes require an authenticated octo_console_token session cookie.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('SERVER_SIDE_CONSOLE_TOKEN');
  });

  it('allows same-origin destructive writes only with the caller session cookie token', async () => {
    process.env['OCTO_WEB_CONSOLE_TOKEN'] = 'SERVER_SIDE_CONSOLE_TOKEN';
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ deleted: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await POST(
      request('POST', {
        cookie: 'CALLER_SESSION_TOKEN',
        origin: 'https://console.example.test',
        body: { action: 'deleteAgent', agentId: 'agent-1' },
      })
    );

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: true });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/agents/agent-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ authorization: 'Bearer CALLER_SESSION_TOKEN' }),
      })
    );
    expect(JSON.stringify(fetchMock.mock.calls)).not.toContain('SERVER_SIDE_CONSOLE_TOKEN');
  });

  it('rejects cross-origin authenticated writes before forwarding to the API', async () => {
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as unknown as typeof fetch;

    const res = await POST(
      request('POST', {
        cookie: 'CALLER_SESSION_TOKEN',
        origin: 'https://evil.example.test',
        body: { action: 'patchNode', nodeId: 'node-1', body: { name: 'Updated' } },
      })
    );

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'F1 Agent Graph console writes require a same-origin request.',
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
