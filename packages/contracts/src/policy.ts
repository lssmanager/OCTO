// Policy and governance contracts

export interface GovernancePolicy {
  id: string;
  nodeId: string;
  maxRecursionDepth: number;
  maxDelegationCap: number;
  tokenBudget?: TokenBudget;
  executionBudget?: ExecutionBudget;
  toolPermissions: ToolPermission[];
  memoryScopes: string[];
  requiresApprovalFor: ApprovalTrigger[];
}

export interface TokenBudget {
  maxPerRun?: number;
  maxPerDay?: number;
  maxPerMonth?: number;
}

export interface ExecutionBudget {
  maxCostUsdPerRun?: number;
  maxCostUsdPerDay?: number;
}

export interface ToolPermission {
  toolName: string;
  allowed: boolean;
  requiresApproval: boolean;
}

export type ApprovalTrigger =
  | 'tool_invocation'
  | 'delegation'
  | 'memory_write'
  | 'external_call'
  | 'high_cost_action';
