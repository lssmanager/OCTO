// packages/database/src/schema/idempotency-keys.ts
// TASK 5 — Idempotency key registry.
//
// Prevents duplicate side effects on retry.
// When a worker processes a step with an idempotency_key:
//   1. INSERT INTO idempotency_keys ... ON CONFLICT DO NOTHING
//   2. If 0 rows affected → key already used → return cached result
//   3. If 1 row affected → first attempt → proceed with operation
//
// Keys expire after 24 hours (TTL). A background job in scheduler-worker
// purges expired rows to prevent unbounded growth.
//
// scope: the domain this key applies to:
//   'execution' — prevents duplicate executions (TASK 5 primary)
//   'step'      — prevents duplicate step side effects within an execution
//   'tool'      — prevents duplicate tool invocations
//   'channel'   — deduplicates inbound channel messages
//
// ADR: F0-005 (Idempotency)

import { pgTable, text, timestamp, jsonb, index, uniqueIndex, pgEnum } from 'drizzle-orm/pg-core';

export const idempotencyKeyScopeEnum = pgEnum('idempotency_key_scope', [
  'execution',
  'step',
  'tool',
  'channel',
]);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    id: text('id').primaryKey(), // UUID v7
    tenantId: text('tenant_id').notNull(),
    scope: idempotencyKeyScopeEnum('scope').notNull(),
    // The key itself — caller-provided stable identifier.
    // Format convention: '<scope>:<entity-id>:<operation>'.
    // Example: 'execution:agent-123:run-xyz'
    key: text('key').notNull(),

    // The result cached from the first successful execution.
    // Returned verbatim on duplicate attempts.
    // Null if the operation is still in progress (locked state).
    result: jsonb('result'),

    // Null while the first attempt is in progress (advisory lock).
    // Set to 'success' or 'failure' when the operation completes.
    status: text('status'), // 'pending' | 'success' | 'failure'

    // Reference to the canonical entity created by the first attempt.
    // e.g. execution_id for scope='execution'
    entityId: text('entity_id'),

    expiresAt: timestamp('expires_at').notNull(), // defaultNow() + 24h set by app
    createdAt: timestamp('created_at').notNull().defaultNow(),
    resolvedAt: timestamp('resolved_at'),
  },
  (t) => ({
    // Primary lookup: (tenant_id, scope, key) — must be unique
    tenantScopeKeyIdx: uniqueIndex('idempotency_keys_tenant_scope_key_uidx').on(
      t.tenantId,
      t.scope,
      t.key
    ),
    expiresIdx: index('idempotency_keys_expires_at_idx').on(t.expiresAt),
    tenantIdx: index('idempotency_keys_tenant_id_idx').on(t.tenantId),
  })
);

export type IdempotencyKey = typeof idempotencyKeys.$inferSelect;
export type NewIdempotencyKey = typeof idempotencyKeys.$inferInsert;
