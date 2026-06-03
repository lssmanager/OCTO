import { NextRequest, NextResponse } from 'next/server';

const API_URL = process.env['API_URL'] ?? 'http://localhost:3001';
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
  const sessionToken = req.cookies.get(CONSOLE_COOKIE)?.value;
  if (sessionToken) return sessionToken;

  if (process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'] === 'true') {
    return process.env['OCTO_WEB_CONSOLE_TOKEN'];
  }

  return undefined;
}

async function forward(path: string, init: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
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

export async function GET() {
  const token = getReadToken();
  if (!token) {
    return jsonError(503, 'OCTO_WEB_CONSOLE_TOKEN is not configured for the authenticated F1 Agent Graph projection.');
  }

  try {
    return await forward('/v1/agents/graph', {
      method: 'GET',
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 15 },
    });
  } catch (err) {
    return jsonError(502, err instanceof Error ? err.message : 'Unable to fetch F1 Agent Graph projection.');
  }
}

export async function POST(req: NextRequest) {
  const token = getWriteToken(req);
  if (!token) {
    return jsonError(
      403,
      'F1 Agent Graph console writes require an httpOnly octo_console_token session cookie or OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES=true with server-side OCTO_WEB_CONSOLE_TOKEN.'
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
    return jsonError(502, err instanceof Error ? err.message : 'Unable to write F1 Agent Graph projection.');
  }
}
