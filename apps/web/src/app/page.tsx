import { cookies } from 'next/headers';
import { AgentGraphConsole } from '@/components/agent-graph-console';
import { getAgentGraph } from '@/lib/agent-graph';

export const revalidate = 15;

export default async function AgentGraphPage() {
  const graph = await getAgentGraph();
  const cookieStore = await cookies();
  const hasConsoleSession = Boolean(cookieStore.get('octo_console_token'));
  return (
    <AgentGraphConsole
      initialNodes={graph.nodes}
      writesConfigured={hasConsoleSession}
      initialError={graph.error}
    />
  );
}
