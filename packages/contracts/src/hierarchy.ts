// Hierarchy primitive contracts

export interface HierarchyNode {
  id: string;
  name: string;
  slug: string;
  level: HierarchyLevel;
  parentId?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type HierarchyLevel = 'agency' | 'department' | 'workspace' | 'agent';

export interface PolicyBoundary {
  nodeId: string;
  nodeLevel: HierarchyLevel;
  maxRecursionDepth: number;
  maxDelegationChain: number;
  maxTokenBudget?: number;
  maxCostBudget?: number;
  allowedTools: string[];
  requiresApproval: boolean;
}
