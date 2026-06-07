import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';
import { AgentGraphConsole } from '@/components/agent-graph-console';
import { getAgentGraph, writesConfigured } from '@/lib/agent-graph';
import { hasDashboardAccess } from '@/lib/dashboard-access';

export const dynamic = 'force-dynamic';

export default async function AgentGraphPage() {
  if (!(await hasDashboardAccess())) {
    notFound();
  }

  const cookieStore = await cookies();
  const consoleSession = cookieStore.get('octo_console_token')?.value;
  const graph = await getAgentGraph(consoleSession);
  return <AgentGraphConsole initialNodes={graph.nodes} writesConfigured={writesConfigured(consoleSession)} initialError={graph.error} />;
}
