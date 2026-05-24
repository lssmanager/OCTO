ALTER TYPE "public"."execution_status" ADD VALUE 'dispatched' BEFORE 'running';--> statement-breakpoint
ALTER TYPE "public"."execution_status" ADD VALUE 'retry_scheduled' BEFORE 'suspended';--> statement-breakpoint
ALTER TYPE "public"."execution_status" ADD VALUE 'reclaimable' BEFORE 'completed';--> statement-breakpoint
ALTER TYPE "public"."step_status" ADD VALUE 'QUEUED';--> statement-breakpoint
ALTER TYPE "public"."step_status" ADD VALUE 'RUNNING';--> statement-breakpoint
ALTER TYPE "public"."step_status" ADD VALUE 'SUCCEEDED';--> statement-breakpoint
ALTER TYPE "public"."step_status" ADD VALUE 'FAILED';--> statement-breakpoint
ALTER TYPE "public"."tool_invocation_status" ADD VALUE 'PENDING';--> statement-breakpoint
ALTER TYPE "public"."tool_invocation_status" ADD VALUE 'RUNNING';--> statement-breakpoint
ALTER TYPE "public"."tool_invocation_status" ADD VALUE 'SUCCEEDED';--> statement-breakpoint
ALTER TYPE "public"."tool_invocation_status" ADD VALUE 'FAILED';--> statement-breakpoint
ALTER TYPE "public"."tool_invocation_status" ADD VALUE 'TIMED_OUT';--> statement-breakpoint
CREATE TABLE "agent_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"version" integer NOT NULL,
	"config_json" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_checkpoint_writes" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"checkpoint_id" text NOT NULL,
	"task_id" text NOT NULL,
	"task_path" text DEFAULT '' NOT NULL,
	"write_index" integer NOT NULL,
	"channel" text NOT NULL,
	"type" text,
	"value_json" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"execution_id" text NOT NULL,
	"step_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"reason" text NOT NULL,
	"payload_json" jsonb NOT NULL,
	"timeout_at" timestamp with time zone,
	"resolved_by" text,
	"resolved_at" timestamp with time zone,
	"resolution_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"aggregate_type" text NOT NULL,
	"aggregate_id" text NOT NULL,
	"event_type" text NOT NULL,
	"sequence" bigint NOT NULL,
	"payload_json" jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tool_invocations" DROP CONSTRAINT "tool_invocations_step_id_execution_steps_id_fk";
--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "task" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "governance" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "trace_id" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "run_id" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "executions" ALTER COLUMN "updated_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "started_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "started_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "execution_steps" ALTER COLUMN "started_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ALTER COLUMN "state" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ALTER COLUMN "created_at" SET DATA TYPE timestamp with time zone;--> statement-breakpoint
ALTER TABLE "tool_invocations" ALTER COLUMN "step_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ALTER COLUMN "input" SET DEFAULT '{}'::jsonb;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN "tenant_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "agent_version_id" text NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "state" text NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "input_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "output_json" jsonb;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "attempt_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "reclaim_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "lease_owner" text;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "cancellation_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "budget_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "context_snapshot_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "created_by" text DEFAULT 'system' NOT NULL;--> statement-breakpoint
ALTER TABLE "executions" ADD COLUMN "reclaimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "tenant_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "state_from" text;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "state_to" text;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "input_json" jsonb;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "output_json" jsonb;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN "tenant_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN "source" text DEFAULT 'runtime' NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN "parent_checkpoint_id" text;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN "state_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN "channel_versions" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN "versions_seen" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD COLUMN "metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "tenant_id" text DEFAULT 'legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "tool_kind" text DEFAULT 'builtin' NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "args_json" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "result_json" jsonb;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "error_code" text;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "error_message" text;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "requires_approval" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "approval_id" text;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "idempotency_key" text NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "started_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD COLUMN "ended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "agent_versions" ADD CONSTRAINT "agent_versions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_checkpoint_writes" ADD CONSTRAINT "execution_checkpoint_writes_checkpoint_id_execution_checkpoints_id_fk" FOREIGN KEY ("checkpoint_id") REFERENCES "public"."execution_checkpoints"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_step_id_execution_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."execution_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agent_versions_tenant_agent" ON "agent_versions" USING btree ("tenant_id","agent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "agent_versions_tenant_agent_version_unique" ON "agent_versions" USING btree ("tenant_id","agent_id","version");--> statement-breakpoint
CREATE INDEX "idx_checkpoint_writes_tenant_checkpoint_write" ON "execution_checkpoint_writes" USING btree ("tenant_id","checkpoint_id","write_index");--> statement-breakpoint
CREATE INDEX "idx_approvals_tenant_status_timeout" ON "approvals" USING btree ("tenant_id","status","timeout_at");--> statement-breakpoint
CREATE INDEX "idx_approvals_execution_status" ON "approvals" USING btree ("execution_id","status");--> statement-breakpoint
CREATE INDEX "idx_outbox_unpublished" ON "outbox_events" USING btree ("published_at","created_at") WHERE published_at IS NULL;--> statement-breakpoint
CREATE INDEX "idx_outbox_tenant_aggregate_sequence" ON "outbox_events" USING btree ("tenant_id","aggregate_type","aggregate_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_outbox_tenant_aggregate_sequence_unique" ON "outbox_events" USING btree ("tenant_id","aggregate_type","aggregate_id","sequence");--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_version_id_agent_versions_id_fk" FOREIGN KEY ("agent_version_id") REFERENCES "public"."agent_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD CONSTRAINT "execution_checkpoints_parent_checkpoint_id_execution_checkpoints_id_fk" FOREIGN KEY ("parent_checkpoint_id") REFERENCES "public"."execution_checkpoints"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_step_id_execution_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."execution_steps"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_agents_tenant" ON "agents" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "idx_executions_tenant_state_created" ON "executions" USING btree ("tenant_id","state","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_executions_lease_stale" ON "executions" USING btree ("state","lease_expires_at") WHERE state IN ('RUNNING', 'RECLAIMING', 'DISPATCHED');--> statement-breakpoint
CREATE INDEX "idx_steps_tenant_execution" ON "execution_steps" USING btree ("tenant_id","execution_id");--> statement-breakpoint
CREATE INDEX "idx_steps_execution_step_index" ON "execution_steps" USING btree ("execution_id","step_index");--> statement-breakpoint
CREATE INDEX "idx_checkpoints_execution_step_index" ON "execution_checkpoints" USING btree ("execution_id","step_index" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "idx_checkpoints_tenant_execution_step" ON "execution_checkpoints" USING btree ("tenant_id","execution_id","step_index" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "idx_checkpoints_execution_step_source" ON "execution_checkpoints" USING btree ("execution_id","step_index","source");--> statement-breakpoint
CREATE INDEX "idx_checkpoints_parent" ON "execution_checkpoints" USING btree ("parent_checkpoint_id");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_tool_invocations_idempotency" ON "tool_invocations" USING btree ("tenant_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_tool_invocations_tenant_execution" ON "tool_invocations" USING btree ("tenant_id","execution_id");--> statement-breakpoint
CREATE INDEX "idx_tool_invocations_tenant_status_started" ON "tool_invocations" USING btree ("tenant_id","status","started_at" DESC NULLS LAST);