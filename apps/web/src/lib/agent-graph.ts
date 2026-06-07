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

const DISABLED_GRAPH_MESSAGE =
  'Agent graph projection is not exposed by the unauthenticated web console.';

export function getBrowserApiUrl() {
  return process.env['NEXT_PUBLIC_API_URL'] ?? process.env['API_URL'] ?? 'http://localhost:3001';
}

export async function getAgentGraph(): Promise<AgentGraphData> {
  return { nodes: [], error: DISABLED_GRAPH_MESSAGE, fetchedAt: new Date().toISOString() };
}
