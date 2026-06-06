ALTER TABLE "hierarchy_nodes" ADD COLUMN IF NOT EXISTS "capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL;
