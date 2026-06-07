import { NextRequest, NextResponse } from 'next/server';

export function normalizeAgentGraphApiUrl(
  value = process.env['API_URL'] ?? 'http://localhost:3001/api'
) {
  return value.replace(/\/+$/, '');
}

export function agentGraphApiUrl(path: string, baseUrl = normalizeAgentGraphApiUrl()) {
  const normalizedBaseUrl = normalizeAgentGraphApiUrl(baseUrl);
  return `${normalizedBaseUrl}${path.startsWith('/') ? path : `/${path}`}`;
}

const API_URL = normalizeAgentGraphApiUrl();
const CONSOLE_COOKIE = 'octo_console_token';

type ConsoleAction = 'createNode' | 'createAgent';

const actionPaths: Record<ConsoleAction, string> = {
  createNode: '/v1/agents/nodes',
  createAgent: '/v1/agents',
};

function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}

function getReadToken() {
  return process.env['OCTO_WEB_CONSOLE_TOKEN'];
}

function getWriteToken(req: NextRequest) {
  return req.cookies.get(CONSOLE_COOKIE)?.value;
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
  const body = contentType.includes('application/json')
    ? await res.json()
    : { error: await res.text() };
  return NextResponse.json(body, { status: res.status });
}

export async function GET() {
  const token = getReadToken();
  if (!token) {
    return jsonError(
      503,
      'OCTO_WEB_CONSOLE_TOKEN is not configured for the authenticated F1 Agent Graph projection.'
    );
  }

  try {
    return await forward('/v1/agents/graph', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      cache: 'no-store',
    });
  } catch (err) {
    return jsonError(
      502,
      err instanceof Error ? err.message : 'Unable to fetch F1 Agent Graph projection.'
    );
  }
}

export async function POST(req: NextRequest) {
  const token = getWriteToken(req);
  if (!token) {
    return jsonError(
      403,
      'F1 Agent Graph console writes require an httpOnly octo_console_token session cookie.'
    );
  }

  let payload: { action?: ConsoleAction; body?: unknown };
  try {
    payload = (await req.json()) as { action?: ConsoleAction; body?: unknown };
  } catch {
    return jsonError(400, 'invalid_json');
  }

  if (!payload.action || !Object.prototype.hasOwnProperty.call(actionPaths, payload.action)) {
    return jsonError(400, 'invalid_agent_graph_console_action');
  }

  try {
    return await forward(actionPaths[payload.action], {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(payload.body ?? {}),
    });
  } catch (err) {
    return jsonError(
      502,
      err instanceof Error ? err.message : 'Unable to write F1 Agent Graph projection.'
    );
  }
}
