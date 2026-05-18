/**
 * delegation.ts — Delegation validation contracts for @octo/agent-core.
 *
 * Architectural invariant (ABSOLUTE PRINCIPLE 6):
 *   The agent hierarchy represents DELEGATION TOPOLOGY, not tenancy.
 *   DelegationEdge encodes operational authority transfer between AgentNodes.
 *   Validation logic (DelegationValidator) lives in the Control Plane.
 *   This file defines ONLY the interfaces and value objects — no runtime logic.
 *
 * FORBIDDEN imports in this file:
 *   ✗ bullmq, ioredis, @nestjs/*, drizzle-orm, postgres
 *   ✗ @octo/queue, @octo/database, apps/api, apps/runtime-worker
 *   ✔ @octo/contracts (type imports only)
 */
import type {
  DelegationEdge,
  DelegationAuthority,
  PolicyBoundary,
} from '@octo/contracts';

// ---------------------------------------------------------------- value objects

/**
 * DelegationCapPolicy — mirrors GovernancePolicy.max_delegation_depth.
 * Travels with every DelegationEdge as an immutable constraint.
 * The Control Plane enforces this; the Execution Plane reads it.
 */
export interface DelegationCapPolicy {
  /** Maximum delegation depth from the root AgentNode. */
  maxDepth: number;
  /** Maximum total delegations in a single execution chain. */
  maxChainLength: number;
  /** Whether circular delegation (A→B→A) is explicitly forbidden. */
  forbidCircular: boolean;
}

// --------------------------------------------------------------- error types

/**
 * DelegationChainViolation — thrown (and caught) by DelegationValidator.
 * Non-retryable: routes directly to DLQ via DlqReason.GOVERNANCE_VIOLATION.
 */
export interface DelegationChainViolation {
  type: 'DEPTH_EXCEEDED' | 'CAP_EXCEEDED' | 'CIRCULAR_DELEGATION' | 'UNAUTHORIZED';
  agentId: string;
  currentDepth: number;
  maxDepth: number;
  message: string;
  /** false — governance violations are never retried */
  retryable: false;
}

// --------------------------------------------------------------- interfaces

/**
 * DelegationValidator — implemented in the Control Plane (apps/api).
 * Interface lives here so the Execution Plane can reference the contract
 * without importing Control Plane modules.
 */
export interface DelegationValidator {
  validate(edge: DelegationEdge): Promise<DelegationValidationResult>;
  checkRecursionDepth(
    agentId: string,
    currentDepth: number,
    maxDepth: number,
  ): boolean;
  checkDelegationCap(
    agentId: string,
    currentChain: string[],
    maxCap: number,
  ): boolean;
}

export interface DelegationValidationResult {
  isValid: boolean;
  reason?: string;
  authority: DelegationAuthority;
  /** Present when isValid=false */
  violation?: DelegationChainViolation;
  /** Resolved effective policy after inheritance chain resolution */
  effectivePolicy?: PolicyBoundary;
}
