import { cookies } from 'next/headers';
import { AgentGraphConsole } from '@/components/agent-graph-console';
import { getAgentGraph, writesConfigured } from '@/lib/agent-graph';

export const dynamic = 'force-dynamic';

export default async function AgentGraphPage() {
  const cookieStore = await cookies();
  const consoleSession = cookieStore.get('octo_console_token')?.value;
  const graph = await getAgentGraph(consoleSession);
  return <AgentGraphConsole initialNodes={graph.nodes} writesConfigured={writesConfigured(consoleSession)} initialError={graph.error} />;
}
