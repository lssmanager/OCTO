CREATE TYPE "public"."agent_status" AS ENUM('active', 'inactive', 'suspended', 'error');--> statement-breakpoint
CREATE TYPE "public"."execution_status" AS ENUM('pending', 'queued', 'running', 'waiting_tool', 'waiting_human', 'retrying', 'suspended', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."trigger_source" AS ENUM('api', 'schedule', 'channel', 'delegation', 'replay');--> statement-breakpoint
CREATE TYPE "public"."step_status" AS ENUM('pending', 'running', 'completed', 'failed', 'skipped');--> statement-breakpoint
CREATE TYPE "public"."step_type" AS ENUM('llm_call', 'tool_dispatch', 'delegation', 'reasoning', 'memory_read', 'memory_write', 'embedding', 'checkpoint', 'approval_gate');--> statement-breakpoint
CREATE TYPE "public"."dlq_reason" AS ENUM('max_retries_exceeded', 'non_retryable_error', 'governance_limit', 'timeout', 'poison_message', 'manual');--> statement-breakpoint
CREATE TYPE "public"."idempotency_key_scope" AS ENUM('execution', 'step', 'tool', 'channel');--> statement-breakpoint
CREATE TYPE "public"."tool_invocation_status" AS ENUM('pending', 'running', 'completed', 'failed', 'timeout');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"role" text NOT NULL,
	"goal" text NOT NULL,
	"parent_id" text,
	"capabilities" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"governance_policy" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "agent_status" DEFAULT 'active' NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "executions" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"idempotency_key" text,
	"trigger_source" "trigger_source" DEFAULT 'api' NOT NULL,
	"trigger_ref" text,
	"status" "execution_status" DEFAULT 'pending' NOT NULL,
	"attempt" integer DEFAULT 0 NOT NULL,
	"queue_job_id" text,
	"worker_id" text,
	"heartbeat_at" timestamp with time zone,
	"lease_expires_at" timestamp with time zone,
	"task" jsonb NOT NULL,
	"governance" jsonb NOT NULL,
	"result" jsonb,
	"error" jsonb,
	"trace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"token_usage" jsonb,
	"cost_usd" jsonb,
	"checkpoint" jsonb,
	"last_checkpoint_id" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_steps" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"step_type" "step_type" NOT NULL,
	"status" "step_status" DEFAULT 'pending' NOT NULL,
	"idempotency_key" text,
	"input" jsonb,
	"output" jsonb,
	"error" jsonb,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"last_error" jsonb,
	"trace_id" text,
	"span_id" text,
	"duration_ms" integer,
	"started_at" timestamp,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_checkpoints" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"step_index" integer NOT NULL,
	"state" jsonb NOT NULL,
	"metadata" jsonb,
	"worker_id" text,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "execution_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"execution_id" text,
	"tenant_id" text NOT NULL,
	"trace_id" text NOT NULL,
	"run_id" text NOT NULL,
	"agent_id" text,
	"source" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"metadata" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "execution_dlq" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text,
	"tenant_id" text NOT NULL,
	"reason" "dlq_reason" NOT NULL,
	"attempts_made" integer NOT NULL,
	"last_error" jsonb NOT NULL,
	"error_chain" jsonb,
	"failure_context" jsonb NOT NULL,
	"queue_name" text NOT NULL,
	"queue_job_id" text NOT NULL,
	"trace_id" text,
	"run_id" text,
	"quarantine" boolean DEFAULT false NOT NULL,
	"notes" text,
	"replayed_at" timestamp,
	"replay_run_id" text,
	"resolved_at" timestamp,
	"resolved_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"scope" "idempotency_key_scope" NOT NULL,
	"key" text NOT NULL,
	"result" jsonb,
	"status" text,
	"entity_id" text,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "tool_invocations" (
	"id" text PRIMARY KEY NOT NULL,
	"execution_id" text NOT NULL,
	"step_id" text,
	"tool_name" text NOT NULL,
	"tool_version" text,
	"status" "tool_invocation_status" DEFAULT 'pending' NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" jsonb,
	"duration_ms" integer,
	"token_usage" jsonb,
	"span_id" text,
	"trace_id" text,
	"invoked_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp
);
--> statement-breakpoint
ALTER TABLE "agents" ADD CONSTRAINT "agents_parent_id_agents_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "executions" ADD CONSTRAINT "executions_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_steps" ADD CONSTRAINT "execution_steps_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_checkpoints" ADD CONSTRAINT "execution_checkpoints_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_events" ADD CONSTRAINT "execution_events_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "execution_dlq" ADD CONSTRAINT "execution_dlq_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_execution_id_executions_id_fk" FOREIGN KEY ("execution_id") REFERENCES "public"."executions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tool_invocations" ADD CONSTRAINT "tool_invocations_step_id_execution_steps_id_fk" FOREIGN KEY ("step_id") REFERENCES "public"."execution_steps"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agents_parent_id_idx" ON "agents" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "agents_status_idx" ON "agents" USING btree ("status");--> statement-breakpoint
CREATE INDEX "executions_agent_id_idx" ON "executions" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "executions_tenant_id_idx" ON "executions" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "executions_status_idx" ON "executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "executions_trace_id_idx" ON "executions" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "executions_created_at_idx" ON "executions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "executions_tenant_status_idx" ON "executions" USING btree ("tenant_id","status");--> statement-breakpoint
CREATE INDEX "executions_worker_id_idx" ON "executions" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "idx_executions_lease" ON "executions" USING btree ("status","lease_expires_at");--> statement-breakpoint
CREATE INDEX "idx_executions_heartbeat" ON "executions" USING btree ("status","heartbeat_at");--> statement-breakpoint
CREATE UNIQUE INDEX "executions_idempotency_key_uidx" ON "executions" USING btree ("tenant_id","idempotency_key") WHERE idempotency_key IS NOT NULL;--> statement-breakpoint
CREATE INDEX "execution_steps_execution_id_idx" ON "execution_steps" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "execution_steps_status_idx" ON "execution_steps" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "execution_steps_execution_step_uidx" ON "execution_steps" USING btree ("execution_id","step_index");--> statement-breakpoint
CREATE INDEX "execution_steps_trace_id_idx" ON "execution_steps" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "execution_steps_step_type_idx" ON "execution_steps" USING btree ("step_type");--> statement-breakpoint
CREATE INDEX "execution_checkpoints_execution_id_idx" ON "execution_checkpoints" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "execution_checkpoints_step_index_idx" ON "execution_checkpoints" USING btree ("execution_id","step_index");--> statement-breakpoint
CREATE INDEX "execution_checkpoints_created_at_idx" ON "execution_checkpoints" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "execution_checkpoints_worker_id_idx" ON "execution_checkpoints" USING btree ("worker_id");--> statement-breakpoint
CREATE INDEX "exec_events_execution_id_idx" ON "execution_events" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "exec_events_tenant_id_idx" ON "execution_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "exec_events_type_idx" ON "execution_events" USING btree ("type");--> statement-breakpoint
CREATE INDEX "exec_events_trace_id_idx" ON "execution_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "exec_events_run_id_idx" ON "execution_events" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "exec_events_created_at_idx" ON "execution_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "exec_events_tenant_created_at_idx" ON "execution_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "dlq_tenant_id_idx" ON "execution_dlq" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "dlq_execution_id_idx" ON "execution_dlq" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "dlq_reason_idx" ON "execution_dlq" USING btree ("reason");--> statement-breakpoint
CREATE INDEX "dlq_quarantine_idx" ON "execution_dlq" USING btree ("quarantine");--> statement-breakpoint
CREATE INDEX "dlq_trace_id_idx" ON "execution_dlq" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "dlq_created_at_idx" ON "execution_dlq" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_tenant_scope_key_uidx" ON "idempotency_keys" USING btree ("tenant_id","scope","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expires_at_idx" ON "idempotency_keys" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idempotency_keys_tenant_id_idx" ON "idempotency_keys" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "tool_invocations_execution_id_idx" ON "tool_invocations" USING btree ("execution_id");--> statement-breakpoint
CREATE INDEX "tool_invocations_step_id_idx" ON "tool_invocations" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "tool_invocations_tool_name_idx" ON "tool_invocations" USING btree ("tool_name");--> statement-breakpoint
CREATE INDEX "tool_invocations_status_idx" ON "tool_invocations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "tool_invocations_invoked_at_idx" ON "tool_invocations" USING btree ("invoked_at");--> statement-breakpoint
CREATE INDEX "tool_invocations_trace_id_idx" ON "tool_invocations" USING btree ("trace_id");