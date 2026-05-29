CREATE TYPE "public"."hierarchy_level" AS ENUM('agency', 'department', 'workspace', 'agent', 'subagent');--> statement-breakpoint
CREATE TYPE "public"."hierarchy_activation_state" AS ENUM('active', 'inactive', 'suspended', 'archived');--> statement-breakpoint
CREATE TABLE "hierarchy_nodes" (
  "id" text PRIMARY KEY NOT NULL,
  "tenant_id" text DEFAULT 'legacy' NOT NULL,
  "level" "hierarchy_level" NOT NULL,
  "name" text NOT NULL,
  "slug" text NOT NULL,
  "parent_id" text,
  "activation_state" "hierarchy_activation_state" DEFAULT 'active' NOT NULL,
  "model_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "tool_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "budget_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "governance" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "core_files" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "memory_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD CONSTRAINT "hierarchy_nodes_parent_id_hierarchy_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "hierarchy_node_id" text;--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_hierarchy_node_id_hierarchy_nodes_id_fk" FOREIGN KEY ("hierarchy_node_id") REFERENCES "public"."hierarchy_nodes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_hierarchy_nodes_tenant_level" ON "hierarchy_nodes" USING btree ("tenant_id","level");--> statement-breakpoint
CREATE INDEX "idx_hierarchy_nodes_parent" ON "hierarchy_nodes" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_hierarchy_nodes_activation_state" ON "hierarchy_nodes" USING btree ("activation_state");--> statement-breakpoint
CREATE UNIQUE INDEX "hierarchy_nodes_tenant_parent_slug_unique" ON "hierarchy_nodes" USING btree ("tenant_id","parent_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "hierarchy_nodes_tenant_root_slug_unique" ON "hierarchy_nodes" USING btree ("tenant_id","slug") WHERE "parent_id" IS NULL;--> statement-breakpoint
CREATE INDEX "agents_hierarchy_node_id_idx" ON "agents" USING btree ("hierarchy_node_id");
