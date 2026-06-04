#!/usr/bin/env bash
set -euo pipefail

# Idempotently creates and grants the F1 least-privilege PostgreSQL role used by
# apps/runtime-worker. Requires a privileged/migration DATABASE_URL and receives
# the runtime password from RUNTIME_POSTGRES_PASSWORD (never from versioned SQL).

RUNTIME_POSTGRES_USER="${RUNTIME_POSTGRES_USER:-octo_runtime}"
RUNTIME_POSTGRES_PASSWORD="${RUNTIME_POSTGRES_PASSWORD:-}"
DATABASE_URL="${DATABASE_URL:-}"
SCHEMA_NAME="${RUNTIME_POSTGRES_SCHEMA:-public}"
PSQL_BIN="${PSQL_BIN:-psql}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is required and must point to a privileged migration/admin role" >&2
  exit 64
fi
if [[ -z "$RUNTIME_POSTGRES_PASSWORD" ]]; then
  echo "RUNTIME_POSTGRES_PASSWORD is required" >&2
  exit 64
fi
if [[ "$RUNTIME_POSTGRES_USER" == "${POSTGRES_USER:-}" ]]; then
  echo "RUNTIME_POSTGRES_USER must differ from POSTGRES_USER" >&2
  exit 65
fi

"$PSQL_BIN" "$DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --set=runtime_role="$RUNTIME_POSTGRES_USER" \
  --set=runtime_password="$RUNTIME_POSTGRES_PASSWORD" \
  --set=schema_name="$SCHEMA_NAME" <<'SQL'
SELECT set_config('octo.runtime_role', :'runtime_role', false);
SELECT set_config('octo.runtime_password', :'runtime_password', false);
SELECT set_config('octo.runtime_schema', :'schema_name', false);

DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
  runtime_password text := current_setting('octo.runtime_password');
BEGIN
  IF runtime_role !~ '^[A-Za-z_][A-Za-z0-9_]*$' THEN
    RAISE EXCEPTION 'Invalid runtime role name: %', runtime_role;
  END IF;
  IF runtime_password = '' THEN
    RAISE EXCEPTION 'Runtime role password must not be empty';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = runtime_role) THEN
    EXECUTE format(
      'CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
      runtime_role,
      runtime_password
    );
  ELSE
    EXECUTE format(
      'ALTER ROLE %I WITH LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS',
      runtime_role,
      runtime_password
    );
  END IF;
END $$;

DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON DATABASE %I FROM %I', current_database(), runtime_role);
  EXECUTE format('REVOKE TEMPORARY ON DATABASE %I FROM PUBLIC', current_database());
  EXECUTE format('REVOKE CREATE, TEMPORARY ON DATABASE %I FROM %I', current_database(), runtime_role);
  EXECUTE format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), runtime_role);
END $$;

DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
  schema_name text := current_setting('octo.runtime_schema');
BEGIN
  EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM PUBLIC', schema_name);
  EXECUTE format('REVOKE ALL PRIVILEGES ON SCHEMA %I FROM %I', schema_name, runtime_role);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, runtime_role);
END $$;

DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
  schema_name text := current_setting('octo.runtime_schema');
BEGIN
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I FROM %I', schema_name, runtime_role);
  EXECUTE format('REVOKE ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I FROM %I', schema_name, runtime_role);

  EXECUTE format(
    'GRANT SELECT, INSERT, UPDATE ON TABLE %I.approvals, %I.execution_checkpoint_writes, %I.execution_checkpoints, %I.execution_steps, %I.executions, %I.outbox_events, %I.tool_invocations, %I.worker_heartbeats TO %I',
    schema_name, schema_name, schema_name, schema_name, schema_name, schema_name, schema_name, schema_name, runtime_role
  );
END $$;

DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
  schema_name text := current_setting('octo.runtime_schema');
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
  IF role_record IS NULL OR NOT role_record.rolcanlogin THEN
    RAISE EXCEPTION 'Runtime DB role % must exist with LOGIN', runtime_role;
  END IF;
  IF role_record.rolsuper OR role_record.rolbypassrls OR role_record.rolcreatedb OR role_record.rolcreaterole OR role_record.rolreplication THEN
    RAISE EXCEPTION 'Runtime DB role % has administrative attributes', runtime_role;
  END IF;
  IF has_schema_privilege(runtime_role, schema_name, 'CREATE') THEN
    RAISE EXCEPTION 'Runtime DB role % must not have CREATE on schema %', runtime_role, schema_name;
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
SQL

echo "runtime-db-role bootstrap passed for role ${RUNTIME_POSTGRES_USER}"
