-- F1-DB-009: eliminate drift between persisted runtime state and shared contracts.
-- Align execution step statuses with canonical lowercase contracts and
-- constrain checkpoint sources to the shared TS/Python enum set.

ALTER TABLE "execution_steps" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
UPDATE "execution_steps"
SET "status" = CASE "status"::text
  WHEN 'QUEUED' THEN 'pending'::step_status
  WHEN 'RUNNING' THEN 'running'::step_status
  WHEN 'SUCCEEDED' THEN 'completed'::step_status
  WHEN 'FAILED' THEN 'failed'::step_status
  ELSE "status"
END
WHERE "status"::text IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED');
--> statement-breakpoint
ALTER TYPE "public"."step_status" RENAME TO "step_status_legacy";
--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
--> statement-breakpoint
ALTER TABLE "execution_steps"
ALTER COLUMN "status" TYPE "public"."step_status"
USING (
  CASE "status"::text
    WHEN 'QUEUED' THEN 'pending'
    WHEN 'RUNNING' THEN 'running'
    WHEN 'SUCCEEDED' THEN 'completed'
    WHEN 'FAILED' THEN 'failed'
    ELSE "status"::text
  END
)::"public"."step_status";
--> statement-breakpoint
DROP TYPE "public"."step_status_legacy";
--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "status" SET DEFAULT 'pending';
--> statement-breakpoint
DO $$ BEGIN
  CREATE TYPE "public"."checkpoint_source" AS ENUM (
    'input',
    'loop',
    'tool',
    'approval',
    'reclaim',
    'final'
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;
--> statement-breakpoint
UPDATE "execution_checkpoints"
SET "source" = 'input'
WHERE "source" = 'runtime';
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ALTER COLUMN "source" DROP DEFAULT;
--> statement-breakpoint
ALTER TABLE "execution_checkpoints"
ALTER COLUMN "source" TYPE "public"."checkpoint_source"
USING (
  CASE "source"
    WHEN 'runtime' THEN 'input'
    ELSE "source"
  END
)::"public"."checkpoint_source";
--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ALTER COLUMN "source" SET DEFAULT 'input';
