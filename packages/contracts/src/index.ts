/**
 * @octo/contracts — Public API
 *
 * Re-exports all contract interfaces and types from the OCTO platform.
 * Zero runtime dependencies — pure TypeScript types only.
 * Organised by ADR source.
 */

// F0-006 — MCP & A2A Protocol Contracts
export * from './protocols/mcp-a2a';

// F0-007 — AutoGen GroupChat Message & Event Contracts
export * from './messaging/messages';

// F0-008 — CrewAI Agent Role Patterns / IAgentProfile
export * from './agents/agent-profile';

// F0-009 — Hermes Coordinator Patterns
export * from './coordination/coordinator';

// F0-010 — Paperclip Budget, Governance & Eval Contracts
export * from './governance/budget-governance';

// F0-011 — agency-agents Template Format
export * from './templates/agent-template';

// Core primitive contracts
export * from './agent';
export * from './execution';
export * from './events';
export * from './hierarchy';
export * from './memory';
export * from './policy';
