// Agent primitive contracts

export interface AgentNode {
  id: string;
  name: string;
  description?: string;
  parentId?: string;
  level: AgentLevel;
  capabilityProfile?: CapabilityProfile;
  createdAt: Date;
  updatedAt: Date;
}

export type AgentLevel = 'agency' | 'department' | 'workspace' | 'agent' | 'subagent';

export interface CapabilityProfile {
  modelId?: string;
  tools: string[];
  skills: string[];
  memoryScopes: string[];
  maxTokensPerRun?: number;
  maxCostPerRun?: number;
}

export interface DelegationEdge {
  id: string;
  fromAgentId: string;
  toAgentId: string;
  authority: DelegationAuthority;
  createdAt: Date;
}

export type DelegationAuthority = 'full' | 'task' | 'readonly';
