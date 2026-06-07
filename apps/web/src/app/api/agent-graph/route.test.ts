import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { agentGraphApiUrl, normalizeAgentGraphApiUrl, POST } from './route';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const routeSource = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8');

afterEach(() => {
  vi.unstubAllEnvs();
});

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

  it('rejects unauthenticated writes even when a server token write opt-in is configured', async () => {
    vi.stubEnv('OCTO_WEB_CONSOLE_TOKEN', 'server-side-secret');
    vi.stubEnv('OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES', 'true');

    const req = new NextRequest('http://localhost/api/agent-graph', {
      method: 'POST',
      body: JSON.stringify({ action: 'createNode', body: { name: 'attacker node' } }),
      headers: { 'content-type': 'application/json' },
    });

    const res = await POST(req);

    expect(res.status).toBe(403);
    await expect(res.json()).resolves.toEqual({
      error: 'F1 Agent Graph console writes require an httpOnly octo_console_token session cookie.',
    });
  });

  it('does not reference browser-public console write secrets', () => {
    expect(routeSource).not.toContain('OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES');
    expect(routeSource).not.toContain('NEXT_PUBLIC_OCTO_CONSOLE_TOKEN');
    expect(routeSource).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*TOKEN/);
  });
});
