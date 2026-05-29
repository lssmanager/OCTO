import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  pgEnum,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { hierarchyNodes } from './hierarchy-nodes';

export const agentStatusEnum = pgEnum('agent_status', ['active', 'inactive', 'suspended', 'error']);

export const agents = pgTable(
  'agents',
  {
    id: text('id').primaryKey(),
    tenantId: text('tenant_id').notNull().default('legacy'),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    role: text('role').notNull(),
    goal: text('goal').notNull(),
    parentId: text('parent_id').references((): AnyPgColumn => agents.id),
    hierarchyNodeId: text('hierarchy_node_id').references(() => hierarchyNodes.id),
    capabilities: jsonb('capabilities').notNull().default([]),
    governancePolicy: jsonb('governance_policy').notNull().default({}),
    status: agentStatusEnum('status').notNull().default('active'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    tenantIdx: index('idx_agents_tenant').on(t.tenantId),
    parentIdx: index('agents_parent_id_idx').on(t.parentId),
    hierarchyNodeIdx: index('agents_hierarchy_node_id_idx').on(t.hierarchyNodeId),
    statusIdx: index('agents_status_idx').on(t.status),
  })
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
