// packages/database/src/schema/index.ts
// Aggregate schema exports.
// All tables and enums live here. PostgreSQL is the system of record.
// Consumers import from '@octo/database' — never from individual schema files directly.
//
// Load order matters for Drizzle: referenced tables must be exported
// before the tables that reference them (FK resolution).

export * from './agents';                  // base entity — no dependencies
export * from './executions';              // depends on agents
export * from './execution-steps';         // depends on executions
export * from './execution-checkpoints';   // depends on executions
export * from './execution-events';        // RENAMED: was events.ts — depends on executions
export * from './execution-dlq';           // NEW: depends on executions
export * from './idempotency-keys';        // NEW: standalone
export * from './tool-invocations';        // depends on executions
