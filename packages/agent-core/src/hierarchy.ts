/**
 * hierarchy.ts — Agent hierarchy and capability types for @octo/agent-core.
 *
 * Architectural invariant (ABSOLUTE PRINCIPLE 6):
 *   Hierarchy represents OPERATIONAL AUTHORITY, delegation chains,
 *   execution specialisation, and coordination topology.
 *   NOT tenancy. NOT workspace isolation. NOT RBAC.
 *
 * Architectural invariant (ABSOLUTE PRINCIPLE 10):
 *   Agent spawning must pass through policy validation.
 *   CapabilityProfile and AgentSpawnRequest encode the governance gate.
 *
 * FORBIDDEN imports in this file:
 *   ✗ bullmq, ioredis, @nestjs/*, drizzle-orm, postgres
 *   ✗ @octo/queue, @octo/database, apps/api, apps/runtime-worker
 *   ✔ @octo/contracts (type imports only)
 */
import type { HierarchyLevel, PolicyBoundary } from '@octo/contracts';

// ------------------------------------------------------------- capability

/**
 * CapabilityProfile — what an AgentNode is permitted to do.
 * Evaluated by the Control Plane's governance engine before execution starts.
 * Ref: ABSOLUTE PRINCIPLE 10 (Governance is Mandatory).
 */
export interface CapabilityProfile {
  agentId: string;
  /** Tool names this agent is permitted to invoke. */
  allowedTools: string[];
  /** Memory scope keys this agent can read/write. */
  allowedMemoryScopes: string[];
  /** Whether this agent can spawn child agents. */
  canDelegate: boolean;
  /** Maximum number of concurrent tasks this agent may run. */
  maxConcurrentTasks: number;
  /** Whether this agent can request human approval gates. */
  canRequestApproval: boolean;
}

// --------------------------------------------------------------- spawn

/**
 * AgentSpawnRequest — governance-gated agent creation request.
 * The Control Plane validates CapabilityProfile.canDelegate before
 * allowing a spawn. Denied spawns route to DLQ with GOVERNANCE_VIOLATION.
 * Ref: ABSOLUTE PRINCIPLE 10.
 */
export interface AgentSpawnRequest {
  parentAgentId: string;
  /** AgentNode definition to materialise. */
  agentDefinition: {
    type: string;
    capabilities: string[];
    model?: string;
    instructions?: string;
  };
  executionId: string;
  traceId: string;
  /** Inherited governance constraints from the parent. */
  inheritedPolicy: PolicyBoundary;
}

// ------------------------------------------------------------- resolver

/**
 * HierarchyResolver — implemented in the Control Plane (apps/api).
 * Interface lives here so the Execution Plane can reference the contract
 * without importing Control Plane modules.
 */
export interface HierarchyResolver {
  resolveInheritance(nodeId: string): Promise<PolicyBoundary[]>;
  resolveAncestors(nodeId: string): Promise<string[]>;
  resolveDescendants(nodeId: string): Promise<string[]>;
  resolveEffectivePolicy(nodeId: string): Promise<PolicyBoundary>;
}

/**
 * HierarchyContext — runtime snapshot of an agent's position in the
 * operational topology. Constructed by the Control Plane and passed
 * to the Execution Plane as part of ExecutionContext.
 */
export interface HierarchyContext {
  agencyId: string;
  departmentId?: string;
  workspaceId?: string;
  agentId?: string;
  level: HierarchyLevel;
  ancestorIds: string[];
  /** Resolved at request time; undefined if resolution is pending. */
  effectivePolicy?: PolicyBoundary;
  capabilityProfile?: CapabilityProfile;
}
