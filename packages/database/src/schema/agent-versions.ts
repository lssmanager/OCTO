import { pgTable, text, timestamp, jsonb, integer, uniqueIndex, index } from 'drizzle-orm/pg-core';
import { agents } from './agents';

export const agentVersions = pgTable(
  'agent_versions',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull(),
    agentId: text('agent_id')
      .notNull()
      .references(() => agents.id),
    version: integer('version').notNull(),
    configJson: jsonb('config_json').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    tenantAgentIdx: index('idx_agent_versions_tenant_agent').on(t.tenantId, t.agentId),
    tenantAgentVersionIdx: uniqueIndex('agent_versions_tenant_agent_version_unique').on(
      t.tenantId,
      t.agentId,
      t.version
    ),
  })
);

export type AgentVersion = typeof agentVersions.$inferSelect;
export type NewAgentVersion = typeof agentVersions.$inferInsert;
