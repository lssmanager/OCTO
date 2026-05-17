import type { DelegationEdge, DelegationAuthority } from '@octo/contracts';

export interface DelegationValidator {
  validate(edge: DelegationEdge): Promise<DelegationValidationResult>;
  checkRecursionDepth(agentId: string, currentDepth: number, maxDepth: number): boolean;
  checkDelegationCap(agentId: string, currentChain: string[], maxCap: number): boolean;
}

export interface DelegationValidationResult {
  isValid: boolean;
  reason?: string;
  authority: DelegationAuthority;
}
