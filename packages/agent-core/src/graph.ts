import type { AgentNode, DelegationEdge } from '@octo/contracts';

export interface ExecutionGraph {
  id: string;
  nodes: ExecutionGraphNode[];
  edges: ExecutionGraphEdge[];
  rootNodeId: string;
  status: 'building' | 'ready' | 'executing' | 'completed' | 'failed';
}

export interface ExecutionGraphNode {
  id: string;
  agentNode: AgentNode;
  taskIds: string[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'skipped';
  dependsOn: string[];
}

export interface ExecutionGraphEdge {
  id: string;
  from: string;
  to: string;
  delegationEdge?: DelegationEdge;
  condition?: string;
}
