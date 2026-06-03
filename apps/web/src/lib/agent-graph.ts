const API_URL = (process.env['API_URL'] ?? 'http://localhost:3001/api').replace(/\/+$/, '');

export type AgentGraphNode = {
  id: string;
  tenantId: string;
  level: 'agency' | 'department' | 'workspace' | 'agent';
  name: string;
  slug: string;
  parentId: string | null;
  activationState: string;
  runtimeStatus: string | null;
  agent: {
    id: string;
    name: string;
    role: string;
    goal: string;
    status: string;
    capabilities: unknown;
    governancePolicy: Record<string, unknown>;
    metadata: Record<string, unknown>;
  } | null;
  localPolicies: Record<string, unknown>;
  effectivePolicies: Record<string, unknown>;
  effectiveCapabilities: unknown[];
  children: AgentGraphNode[];
  createdAt: string;
  updatedAt: string;
};

export type AgentGraphData = {
  nodes: AgentGraphNode[];
  error?: string;
  fetchedAt: string;
};

export function writesConfigured() {
  return Boolean(process.env['OCTO_WEB_CONSOLE_TOKEN'] && process.env['OCTO_WEB_CONSOLE_ALLOW_SERVER_TOKEN_WRITES'] === 'true');
}

export async function getAgentGraph(): Promise<AgentGraphData> {
  const token = process.env['OCTO_WEB_CONSOLE_TOKEN'];
  if (!token) {
    return { nodes: [], error: 'OCTO_WEB_CONSOLE_TOKEN is not configured for the authenticated console projection.', fetchedAt: new Date().toISOString() };
  }
  try {
    const res = await fetch(`${API_URL}/v1/agents/graph`, {
      headers: { authorization: `Bearer ${token}` },
      next: { revalidate: 15 },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return { nodes: [], error: `API returned HTTP ${res.status}`, fetchedAt: new Date().toISOString() };
    return { nodes: (await res.json()) as AgentGraphNode[], fetchedAt: new Date().toISOString() };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to fetch agent graph';
    return { nodes: [], error: message, fetchedAt: new Date().toISOString() };
  }
}
