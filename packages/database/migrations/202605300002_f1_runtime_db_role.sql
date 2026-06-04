-- F1-DB-013: least-privilege runtime-worker database role.
-- This migration turns the F1 runtime direct-writer contract into an
-- operational PostgreSQL control. The role can write only the F1 runtime
-- durable-progress tables and is explicitly barred from SUPERUSER/BYPASSRLS.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'octo_runtime') THEN
    CREATE ROLE octo_runtime
      LOGIN
      NOSUPERUSER
      NOCREATEDB
      NOCREATEROLE
      NOINHERIT
      NOREPLICATION
      NOBYPASSRLS;
  ELSE
    ALTER ROLE octo_runtime
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
REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM octo_runtime;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public FROM octo_runtime;
--> statement-breakpoint
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
--> statement-breakpoint
REVOKE ALL PRIVILEGES ON SCHEMA public FROM octo_runtime;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM octo_runtime', current_database());
END $$;
--> statement-breakpoint
DO $$
BEGIN
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO octo_runtime', current_database());
END $$;
--> statement-breakpoint
GRANT USAGE ON SCHEMA public TO octo_runtime;
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
TO octo_runtime;
--> statement-breakpoint
DO $$
DECLARE
  runtime_role CONSTANT text := 'octo_runtime';
  schema_name CONSTANT text := 'public';
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
  IF has_database_privilege(runtime_role, current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION 'Runtime DB role % must not have TEMPORARY on database %', runtime_role, current_database();
  END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO unexpected_table_grants
  FROM information_schema.role_table_grants
  WHERE grantee = runtime_role
    AND table_schema = schema_name
    AND NOT (table_name = ANY (allowed_tables));
  IF unexpected_table_grants IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has direct table grants outside F1 contract: %', runtime_role, unexpected_table_grants;
  END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO unexpected_privileges
  FROM information_schema.role_table_grants
  WHERE grantee = runtime_role
    AND table_schema = schema_name
    AND table_name = ANY (allowed_tables)
    AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE');
  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has direct disallowed privileges on F1 tables: %', runtime_role, unexpected_privileges;
  END IF;

  SELECT string_agg(table_name || ':' || privilege, ', ' ORDER BY table_name, privilege)
  INTO unexpected_table_grants
  FROM (
    SELECT c.relname AS table_name, p.privilege
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
    WHERE n.nspname = schema_name
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND NOT (c.relname = ANY (allowed_tables))
      AND has_table_privilege(runtime_role, format('%I.%I', schema_name, c.relname), p.privilege)
  ) effective_table_privileges;
  IF unexpected_table_grants IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has effective table privileges outside F1 contract: %', runtime_role, unexpected_table_grants;
  END IF;

  SELECT string_agg(table_name || ':' || privilege, ', ' ORDER BY table_name, privilege)
  INTO unexpected_privileges
  FROM (
    SELECT c.relname AS table_name, p.privilege
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    CROSS JOIN (VALUES ('DELETE'), ('TRUNCATE'), ('REFERENCES'), ('TRIGGER')) AS p(privilege)
    WHERE n.nspname = schema_name
      AND c.relkind IN ('r', 'p', 'v', 'm', 'f')
      AND c.relname = ANY (allowed_tables)
      AND has_table_privilege(runtime_role, format('%I.%I', schema_name, c.relname), p.privilege)
  ) effective_disallowed_privileges;
  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has effective disallowed privileges on F1 tables: %', runtime_role, unexpected_privileges;
  END IF;

  SELECT string_agg(table_name || ':' || privilege, ', ' ORDER BY table_name, privilege)
  INTO unexpected_privileges
  FROM unnest(allowed_tables) AS allowed(table_name)
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS p(privilege)
  WHERE NOT has_table_privilege(runtime_role, format('%I.%I', schema_name, allowed.table_name), p.privilege);
  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % is missing required effective F1 table privileges: %', runtime_role, unexpected_privileges;
  END IF;

  WITH public_sequences AS (
    SELECT c.relname AS sequence_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = schema_name
      AND c.relkind = 'S'
  ), allowed_sequences AS (
    SELECT seq.relname AS sequence_name
    FROM pg_class seq
    JOIN pg_namespace seq_ns ON seq_ns.oid = seq.relnamespace
    JOIN pg_depend dep ON dep.objid = seq.oid AND dep.deptype IN ('a', 'i')
    JOIN pg_class tbl ON tbl.oid = dep.refobjid
    JOIN pg_namespace tbl_ns ON tbl_ns.oid = tbl.relnamespace
    WHERE seq_ns.nspname = schema_name
      AND tbl_ns.nspname = schema_name
      AND tbl.relname = ANY (allowed_tables)
      AND seq.relkind = 'S'
  )
  SELECT string_agg(sequence_name || ':' || privilege, ', ' ORDER BY sequence_name, privilege)
  INTO unexpected_privileges
  FROM public_sequences
  CROSS JOIN (VALUES ('USAGE'), ('SELECT'), ('UPDATE')) AS p(privilege)
  WHERE NOT EXISTS (
      SELECT 1 FROM allowed_sequences WHERE allowed_sequences.sequence_name = public_sequences.sequence_name
    )
    AND has_sequence_privilege(runtime_role, format('%I.%I', schema_name, public_sequences.sequence_name), p.privilege);
  IF unexpected_privileges IS NOT NULL THEN
    RAISE EXCEPTION 'Runtime DB role % has effective sequence privileges outside F1 contract: %', runtime_role, unexpected_privileges;
  END IF;
END $$;
