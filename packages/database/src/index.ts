// @octo/database — Drizzle ORM + PostgreSQL
// PostgreSQL is the SYSTEM OF RECORD (OCTO Architecture Principle #12).
// Stores: executions, events, topology, approvals, policies, checkpoints, memory metadata.
//
// ARCHITECTURAL BOUNDARY:
//   apps/runtime-worker MUST NOT import this package.
//   Only the control-plane (apps/api) has direct DB access.

export * from './client';
export * from './schema';
export * from './queries';
export * from './outbox';

export * from './outbox-publisher-db';
