import {
  pgTable,
  text,
  timestamp,
  jsonb,
  index,
  pgEnum,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';

export const agentStatusEnum = pgEnum('agent_status', [
  'active',
  'inactive',
  'suspended',
  'error',
]);

 
export const agents = pgTable(
  'agents',
  {
    id: text('id').primaryKey(), // UUID v7
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    role: text('role').notNull(), // CrewAI: agent.role
    goal: text('goal').notNull(), // CrewAI: agent.goal
    parentId: text('parent_id').references((): AnyPgColumn => agents.id),
    capabilities: jsonb('capabilities').notNull().default([]),
    governancePolicy: jsonb('governance_policy').notNull().default({}), // Paperclip budget
    status: agentStatusEnum('status').notNull().default('active'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => ({
    parentIdx: index('agents_parent_id_idx').on(t.parentId),
    statusIdx: index('agents_status_idx').on(t.status),
  }),
);

export type Agent = typeof agents.$inferSelect;
export type NewAgent = typeof agents.$inferInsert;
