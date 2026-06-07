import { NextRequest, NextResponse } from 'next/server';

export function normalizeAgentGraphApiUrl(value = process.env['API_URL'] ?? 'http://localhost:3001/api') {
  return value.replace(/\/+$/, '');
}

export function agentGraphApiUrl(path: string, baseUrl = normalizeAgentGraphApiUrl()) {
  const normalizedBaseUrl = normalizeAgentGraphApiUrl(baseUrl);
  return `${normalizedBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

const API_URL = normalizeAgentGraphApiUrl();
export const CONSOLE_COOKIE = 'octo_console_token';

type ConsoleAction = 'createNode' | 'createAgent' | 'patchNode' | 'reparentNode' | 'patchAgent' | 'deleteAgent' | 'archiveNode' | 'setActivationState';

type ActionSpec = { path: (payload: ConsolePayload) => string; method: 'POST' | 'PATCH' | 'DELETE'; body?: (payload: ConsolePayload) => unknown };
type ConsolePayload = { action?: ConsoleAction; nodeId?: string; agentId?: string; body?: unknown };

function requireId(value: string | undefined, label: string) {
  if (!value) throw new Error(`missing_${label}`);
  return encodeURIComponent(value);
}

const actionSpecs: Record<ConsoleAction, ActionSpec> = {
  createNode: { method: 'POST', path: () => '/v1/agents/nodes' },
  createAgent: { method: 'POST', path: () => '/v1/agents' },
  patchNode: { method: 'PATCH', path: (payload) => `/v1/agents/nodes/${requireId(payload.nodeId, 'node_id')}` },
  reparentNode: { method: 'PATCH', path: (payload) => `/v1/agents/nodes/${requireId(payload.nodeId, 'node_id')}/parent` },
  patchAgent: { method: 'PATCH', path: (payload) => `/v1/agents/${requireId(payload.agentId, 'agent_id')}` },
  deleteAgent: { method: 'DELETE', path: (payload) => `/v1/agents/${requireId(payload.agentId, 'agent_id')}`, body: () => undefined },
  archiveNode: { method: 'PATCH', path: (payload) => `/v1/agents/nodes/${requireId(payload.nodeId, 'node_id')}`, body: (payload) => ({ ...(payload.body as Record<string, unknown> | undefined), activationState: 'archived' }) },
  setActivationState: { method: 'PATCH', path: (payload) => `/v1/agents/nodes/${requireId(payload.nodeId, 'node_id')}`, body: (payload) => payload.body },
};

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function getSessionToken(req: NextRequest) {
  return req.cookies.get(CONSOLE_COOKIE)?.value;
}

function sameOriginRequest(req: NextRequest) {
  const origin = req.headers.get('origin');
  if (!origin) return true;
  return origin === req.nextUrl.origin;
}

async function forward(path: string, init: RequestInit) {
  const res = await fetch(agentGraphApiUrl(path, API_URL), {
    ...init,
    headers: {
      accept: 'application/json',
      ...(init.headers ?? {}),
    },
    signal: AbortSignal.timeout(5000),
  });

  const contentType = res.headers.get('content-type') ?? '';
  const body = contentType.includes('application/json') ? await res.json() : { error: await res.text() };
  return NextResponse.json(body, { status: res.status });
}

export async function GET(req: NextRequest) {
  const token = getSessionToken(req);
  if (!token) {
    return jsonError(401, 'F1 Agent Graph console reads require an authenticated octo_console_token session cookie.');
  }

  try {
    return await forward('/v1/agents/graph', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch (err) {
    return jsonError(502, err instanceof Error ? err.message : 'Unable to fetch F1 Agent Graph projection.');
  }
}

export async function POST(req: NextRequest) {
  if (!sameOriginRequest(req)) {
    return jsonError(403, 'F1 Agent Graph console writes require a same-origin request.');
  }

  const token = getSessionToken(req);
  if (!token) {
    return jsonError(401, 'F1 Agent Graph console writes require an authenticated octo_console_token session cookie.');
  }

  let payload: ConsolePayload;
  try {
    payload = (await req.json()) as ConsolePayload;
  } catch {
    return jsonError(400, 'invalid_json');
  }

  if (!payload.action || !Object.prototype.hasOwnProperty.call(actionSpecs, payload.action)) {
    return jsonError(400, 'invalid_agent_graph_console_action');
  }

  try {
    const spec = actionSpecs[payload.action];
    const body = spec.body ? spec.body(payload) : payload.body;
    return await forward(spec.path(payload), {
      method: spec.method,
      headers: { authorization: `Bearer ${token}`, ...(spec.method === 'DELETE' ? {} : { 'content-type': 'application/json' }) },
      ...(spec.method === 'DELETE' ? {} : { body: JSON.stringify(body ?? {}) }),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to write F1 Agent Graph projection.';
    return jsonError(message.startsWith('missing_') ? 400 : 502, message);
  }
}
