import { AgentGraphConsole } from '@/components/agent-graph-console';
import { getAgentGraph, getBrowserApiUrl } from '@/lib/agent-graph';

export const revalidate = 15;

export default async function AgentGraphPage() {
  const graph = await getAgentGraph();
  return (
    <AgentGraphConsole
      initialNodes={graph.nodes}
      apiUrl={getBrowserApiUrl()}
      tokenConfigured={Boolean(process.env['OCTO_WEB_CONSOLE_TOKEN'])}
      initialError={graph.error}
    />
  );
}
