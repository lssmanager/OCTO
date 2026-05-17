import type { HierarchyLevel, PolicyBoundary } from '@octo/contracts';

export interface HierarchyResolver {
  resolveInheritance(nodeId: string): Promise<PolicyBoundary[]>;
  resolveAncestors(nodeId: string): Promise<string[]>;
  resolveDescendants(nodeId: string): Promise<string[]>;
  resolveEffectivePolicy(nodeId: string): Promise<PolicyBoundary>;
}

export interface HierarchyContext {
  agencyId: string;
  departmentId?: string;
  workspaceId?: string;
  agentId?: string;
  level: HierarchyLevel;
  ancestorIds: string[];
}
