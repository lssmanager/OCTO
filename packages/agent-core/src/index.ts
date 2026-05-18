/**
 * @octo/agent-core — Public API
 *
 * Scope: cognitive and operational structures of agents.
 *   ✔ DAG-based execution graph types (Principle 4)
 *   ✔ Delegation topology interfaces (Principle 6)
 *   ✔ Hierarchy resolution contracts (Principle 6)
 *   ✔ Capability profiles + governance gates (Principle 10)
 *   ✔ Checkpoint structures for pause/resume (Principle 13)
 *
 * ABSOLUTE INVARIANTS — this package MUST NEVER import:
 *   ✗ bullmq          — queue logic belongs to @octo/queue + Control Plane
 *   ✗ ioredis         — Redis access belongs to runtime worker + Control Plane
 *   ✗ drizzle-orm     — DB access belongs to @octo/database + Control Plane
 *   ✗ postgres        — same as above
 *   ✗ @nestjs/*       — framework deps must not leak into shared packages
 *   ✗ @octo/queue     — orchestration authority stays in Control Plane
 *   ✗ @octo/database  — persistence authority stays in Control Plane
 *   ✗ apps/api        — Control Plane is a consumer of this package, not a dep
 *   ✗ apps/runtime-worker — Execution Plane is a consumer, not a dep
 *
 * Allowed dep: @octo/contracts (type imports only, no runtime code).
 *
 * CI enforcement: any PR adding a forbidden import to this package
 * MUST be blocked. Add a lint rule (no-restricted-imports) in F1+.
 */
export * from './hierarchy';
export * from './graph';
export * from './delegation';
