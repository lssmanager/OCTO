import { describe, expect, it } from 'vitest';
import { agentGraphApiUrl, normalizeAgentGraphApiUrl } from './route';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const routeSource = readFileSync(fileURLToPath(new URL('./route.ts', import.meta.url)), 'utf8');

describe('F1 Agent Graph route URL contract', () => {
  it('uses an API base URL that includes the global /api prefix by default', () => {
    expect(normalizeAgentGraphApiUrl()).toBe('http://localhost:3001/api');
  });

  it('normalizes a trailing slash before appending Agent Graph paths', () => {
    expect(agentGraphApiUrl('/v1/agents/graph', 'https://agents.socialstudies.cloud/api/')).toBe('https://agents.socialstudies.cloud/api/v1/agents/graph');
  });

  it('routes Agent Graph actions to /api/v1/agents targets without duplicating /api', () => {
    const base = normalizeAgentGraphApiUrl('http://localhost:3001/api/');
    expect(agentGraphApiUrl('/v1/agents/graph', base)).toBe('http://localhost:3001/api/v1/agents/graph');
    expect(agentGraphApiUrl('/v1/agents/nodes', base)).toBe('http://localhost:3001/api/v1/agents/nodes');
    expect(agentGraphApiUrl('/v1/agents', base)).toBe('http://localhost:3001/api/v1/agents');
  });

  it('does not reference browser-public console write secrets', () => {
    expect(routeSource).not.toContain('NEXT_PUBLIC_OCTO_CONSOLE_TOKEN');
    expect(routeSource).not.toMatch(/NEXT_PUBLIC_[A-Z0-9_]*TOKEN/);
  });
});
