import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { agentGraphApiUrl, normalizeAgentGraphApiUrl, POST } from './route';

const routeSource = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8');

function request(body: unknown, cookie?: string) {
  return new NextRequest('https://web.test/api/agent-graph', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
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

describe('agent graph POST proxy authorization', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'];
    delete process.env['OCTO_WEB_CONSOLE_TOKEN'];
  });

  it('blocks destructive writes that would use the unauthenticated server-token fallback', async () => {
    process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'] = 'true';
    process.env['OCTO_WEB_CONSOLE_TOKEN'] = 'server-token';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({ action: 'deleteAgent', agentId: 'agent-1' }));

    await expect(response.json()).resolves.toEqual({
      error:
        'F1 Agent Graph server-token writes are limited to createNode and createAgent actions. Use an authenticated console session for destructive or state-changing writes.',
    });
    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('still allows server-token fallback for bootstrap create actions', async () => {
    process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'] = 'true';
    process.env['OCTO_WEB_CONSOLE_TOKEN'] = 'server-token';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'node-1' }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(request({ action: 'createNode', body: { name: 'Node' } }));

    await expect(response.json()).resolves.toEqual({ id: 'node-1' });
    expect(response.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/agents/nodes',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer server-token' }),
      })
    );
  });

  it('allows destructive writes from an authenticated console session cookie', async () => {
    process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'] = 'true';
    process.env['OCTO_WEB_CONSOLE_TOKEN'] = 'server-token';
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ deleted: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const response = await POST(
      request({ action: 'deleteAgent', agentId: 'agent-1' }, 'octo_console_token=session-token')
    );

    await expect(response.json()).resolves.toEqual({ deleted: true });
    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:3001/api/v1/agents/agent-1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ authorization: 'Bearer session-token' }),
      })
    );
  });
});
