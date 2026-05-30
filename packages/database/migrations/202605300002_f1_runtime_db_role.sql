-- F1-DB-013: least-privilege runtime-worker database role.
-- This migration turns the F1 runtime direct-writer contract into an
-- operational PostgreSQL control. The role can write only the F1 runtime
-- durable-progress tables and is explicitly barred from SUPERUSER/BYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'octo_runtime_worker') THEN
    CREATE ROLE octo_runtime_worker
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE octo_runtime_worker
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  END IF;
END $$;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM octo_runtime_worker;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM octo_runtime_worker;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON SCHEMA public FROM octo_runtime_worker;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM octo_runtime_worker', current_database());
END $$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO octo_runtime_worker', current_database());
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO octo_runtime_worker;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON TABLE
  approvals,
  execution_checkpoint_writes,
  execution_checkpoints,
  execution_steps,
  executions,
  outbox_events,
  tool_invocations,
  worker_heartbeats
TO octo_runtime_worker;
--> statement-breakpoint
DO $$
DECLARE
  runtime_role CONSTANT text := 'octo_runtime_worker';
  allowed_tables CONSTANT text[] := ARRAY[
    'approvals',
    'execution_checkpoint_writes',
    'execution_checkpoints',
    'execution_steps',
    'executions',
    'outbox_events',
    'tool_invocations',
    'worker_heartbeats'
  ];
  role_record record;
  unexpected_table_grants text;
  unexpected_privileges text;
BEGIN
  SELECT * INTO role_record FROM pg_roles WHERE rolname = runtime_role;
  IF role_record IS NULL THEN
    RAISE EXCEPTION 'Runtime DB role % does not exist', runtime_role;
  END IF;

  IF role_record.rolsuper THEN
    RAISE EXCEPTION 'Runtime DB role % must not be SUPERUSER', runtime_role;
  END IF;
  IF role_record.rolbypassrls THEN
    RAISE EXCEPTION 'Runtime DB role % must not have BYPASSRLS', runtime_role;
  END IF;
  IF role_record.rolcreatedb THEN
    RAISE EXCEPTION 'Runtime DB role % must not have CREATEDB', runtime_role;
  END IF;
  IF role_record.rolcreaterole THEN
    RAISE EXCEPTION 'Runtime DB role % must not have CREATEROLE', runtime_role;
  END IF;
  IF role_record.rolreplication THEN
    RAISE EXCEPTION 'Runtime DB role % must not have REPLICATION', runtime_role;
  END IF;

  IF has_schema_privilege(runtime_role, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Runtime DB role % must not have CREATE on schema public', runtime_role;
  END IF;
  IF has_database_privilege(runtime_role, current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'Runtime DB role % must not have CREATE on database %', runtime_role, current_database();
  END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO unexpected_table_grants
  FROM information_schema.role_table_grants
  WHERE grantee = runtime_role
    AND table_schema = 'public'
    AND NOT (table_name = ANY (allowed_tables));

  IF unexpected_table_grants IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has table grants outside F1 contract: %', runtime_role, unexpected_table_grants;
  END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO unexpected_privileges
  FROM information_schema.role_table_grants
  WHERE grantee = runtime_role
    AND table_schema = 'public'
    AND table_name = ANY (allowed_tables)
    AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE');

  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has disallowed privileges on F1 tables: %', runtime_role, unexpected_privileges;
  END IF;
END $$;
