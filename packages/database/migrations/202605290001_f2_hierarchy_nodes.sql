DO $$ BEGIN
  CREATE TYPE "public"."hierarchy_level" AS ENUM('agency', 'department', 'workspace', 'agent', 'subagent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."hierarchy_activation_state" AS ENUM('active', 'inactive', 'suspended', 'archived');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "hierarchy_nodes" (
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
);
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "tenant_id" text DEFAULT 'legacy' NOT NULL;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "parent_id" text;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_nodes_tenant_id_id_unique" ON "hierarchy_nodes" USING btree ("tenant_id", "id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hierarchy_nodes_parent_id_hierarchy_nodes_id_fk') THEN
    ALTER TABLE "hierarchy_nodes"
      ADD CONSTRAINT "hierarchy_nodes_parent_id_hierarchy_nodes_id_fk"
      FOREIGN KEY ("parent_id") REFERENCES "public"."hierarchy_nodes"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'hierarchy_nodes_parent_tenant_fk') THEN
    ALTER TABLE "hierarchy_nodes"
      ADD CONSTRAINT "hierarchy_nodes_parent_tenant_fk"
      FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "public"."hierarchy_nodes"("tenant_id", "id")
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "hierarchy_node_id" text;
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_hierarchy_node_id_hierarchy_nodes_id_fk') THEN
    ALTER TABLE "agents"
      ADD CONSTRAINT "agents_hierarchy_node_id_hierarchy_nodes_id_fk"
      FOREIGN KEY ("hierarchy_node_id") REFERENCES "public"."hierarchy_nodes"("id")
      ON DELETE no action ON UPDATE no action;
  END IF;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "agents_tenant_id_id_unique" ON "agents" USING btree ("tenant_id", "id");
--> statement-breakpoint
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'agents_hierarchy_node_tenant_fk') THEN
    ALTER TABLE "agents"
      ADD CONSTRAINT "agents_hierarchy_node_tenant_fk"
      FOREIGN KEY ("tenant_id", "hierarchy_node_id") REFERENCES "public"."hierarchy_nodes"("tenant_id", "id")
      ON DELETE RESTRICT NOT VALID;
  END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "hierarchy_nodes" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
DROP POLICY IF EXISTS tenant_isolation_hierarchy_nodes ON "hierarchy_nodes";
--> statement-breakpoint
CREATE POLICY tenant_isolation_hierarchy_nodes ON "hierarchy_nodes"
  USING (
    tenant_id = current_setting('app.current_tenant', true)
    AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
  )
  WITH CHECK (
    tenant_id = current_setting('app.current_tenant', true)
    AND COALESCE(current_setting('app.current_tenant', true), '') <> ''
  );
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hierarchy_nodes_tenant_level" ON "hierarchy_nodes" USING btree ("tenant_id","level");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hierarchy_nodes_parent" ON "hierarchy_nodes" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_hierarchy_nodes_activation_state" ON "hierarchy_nodes" USING btree ("activation_state");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "hierarchy_nodes_tenant_parent_slug_unique" ON "hierarchy_nodes" USING btree ("tenant_id","parent_id","slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "agents_hierarchy_node_id_idx" ON "agents" USING btree ("hierarchy_node_id");
