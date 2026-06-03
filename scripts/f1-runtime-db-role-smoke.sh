#!/usr/bin/env bash
set -euo pipefail

STRICT=0
if [[ "${1:-}" == "--strict" ]]; then
  STRICT=1
elif [[ "${1:-}" != "" ]]; then
  echo "Usage: $0 [--strict]" >&2
  exit 64
fi

DATABASE_URL="${DATABASE_URL:-}"
RUNTIME_DATABASE_URL="${RUNTIME_DATABASE_URL:-}"
RUNTIME_POSTGRES_USER="${RUNTIME_POSTGRES_USER:-octo_runtime}"
PSQL_BIN="${PSQL_BIN:-psql}"
TENANT_ID="${F1_RUNTIME_DB_ROLE_SMOKE_TENANT_ID:-tenant-f1-runtime-role-smoke}"
RUN_ID="f1-runtime-role-smoke-$RANDOM-$$"

if [[ -z "$DATABASE_URL" ]]; then
  echo "DATABASE_URL is required for admin/setup checks" >&2
  exit 64
fi
if [[ -z "$RUNTIME_DATABASE_URL" ]]; then
  if [[ "$STRICT" == "1" || "${F1_CLOSE_GATE:-0}" == "1" || "${NODE_ENV:-}" == "production" ]]; then
    echo "RUNTIME_DATABASE_URL is required in strict/close/production mode" >&2
    exit 65
  fi
  echo "RUNTIME_DATABASE_URL is not set; skipping runtime-role smoke outside strict mode" >&2
  exit 0
fi

URL_USERS="$({ DATABASE_URL="$DATABASE_URL" RUNTIME_DATABASE_URL="$RUNTIME_DATABASE_URL" python3 - <<'PY'
from urllib.parse import urlparse
import os
for key in ("DATABASE_URL", "RUNTIME_DATABASE_URL"):
    parsed = urlparse(os.environ[key])
    print(parsed.username or "")
PY
} )"
ADMIN_USER="$(printf '%s\n' "$URL_USERS" | sed -n '1p')"
RUNTIME_URL_USER="$(printf '%s\n' "$URL_USERS" | sed -n '2p')"
if [[ -z "$RUNTIME_URL_USER" ]]; then
  echo "RUNTIME_DATABASE_URL must include an explicit username" >&2
  exit 65
fi
if [[ "$RUNTIME_URL_USER" != "$RUNTIME_POSTGRES_USER" ]]; then
  echo "RUNTIME_DATABASE_URL username ($RUNTIME_URL_USER) must match RUNTIME_POSTGRES_USER ($RUNTIME_POSTGRES_USER)" >&2
  exit 65
fi
if [[ "$ADMIN_USER" == "$RUNTIME_URL_USER" ]]; then
  echo "Runtime Worker must not use the same PostgreSQL credential as DATABASE_URL ($ADMIN_USER)" >&2
  exit 65
fi

cleanup() {
  "$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet \
    --set=tenant_id="$TENANT_ID" --set=run_id="$RUN_ID" <<'SQL' >/dev/null || true
SELECT set_config('app.current_tenant', :'tenant_id', false);
DELETE FROM worker_heartbeats WHERE id LIKE :'run_id' || '%';
DELETE FROM executions WHERE tenant_id = :'tenant_id' AND id = :'run_id' || '-execution';
DELETE FROM agent_versions WHERE tenant_id = :'tenant_id' AND id = :'run_id' || '-agent-version';
DELETE FROM agents WHERE tenant_id = :'tenant_id' AND id = :'run_id' || '-agent';
SQL
}
trap cleanup EXIT

"$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet \
  --set=tenant_id="$TENANT_ID" --set=run_id="$RUN_ID" <<'SQL'
SELECT set_config('app.current_tenant', :'tenant_id', false);
INSERT INTO agents (id, tenant_id, name, role, goal)
VALUES (:'run_id' || '-agent', :'tenant_id', 'F1 runtime role smoke', 'tester', 'verify least privilege');
INSERT INTO agent_versions (id, tenant_id, agent_id, version, config_json)
VALUES (:'run_id' || '-agent-version', :'tenant_id', :'run_id' || '-agent', 1, '{}'::jsonb);
INSERT INTO executions (
  id, tenant_id, agent_id, agent_version_id, state, status, input_json,
  budget_snapshot_json, context_snapshot_json, created_by, trace_id, run_id
) VALUES (
  :'run_id' || '-execution', :'tenant_id', :'run_id' || '-agent', :'run_id' || '-agent-version',
  'pending', 'pending', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, 'f1-runtime-role-smoke',
  :'run_id' || '-trace', :'run_id'
);
SQL


"$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet \
  --set=runtime_role="$RUNTIME_POSTGRES_USER" <<'SQL'
SELECT set_config('octo.runtime_role', :'runtime_role', false);

DO $$
DECLARE
  runtime_role text := current_setting('octo.runtime_role');
  allowed_tables CONSTANT text[] := ARRAY[
    'approvals', 'execution_checkpoint_writes', 'execution_checkpoints', 'execution_steps',
    'executions', 'outbox_events', 'tool_invocations', 'worker_heartbeats'
  ];
  role_record record;
  unexpected text;
BEGIN
  SELECT * INTO role_record FROM pg_roles WHERE rolname = runtime_role;
  IF role_record IS NULL OR NOT role_record.rolcanlogin THEN
    RAISE EXCEPTION 'runtime role % must exist with LOGIN', runtime_role;
  END IF;
  IF role_record.rolsuper OR role_record.rolcreatedb OR role_record.rolcreaterole OR role_record.rolreplication OR role_record.rolbypassrls THEN
    RAISE EXCEPTION 'runtime role % has administrative attributes or BYPASSRLS', runtime_role;
  END IF;
  IF NOT has_schema_privilege(runtime_role, 'public', 'USAGE') THEN
    RAISE EXCEPTION 'runtime role % lacks USAGE on public', runtime_role;
  END IF;
  IF has_schema_privilege(runtime_role, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'runtime role % must not have CREATE on public', runtime_role;
  END IF;
  IF has_database_privilege(runtime_role, current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'runtime role % must not have CREATE on database', runtime_role;
  END IF;
  IF has_database_privilege(runtime_role, current_database(), 'TEMPORARY') THEN
    RAISE EXCEPTION 'runtime role % must not have TEMPORARY on database', runtime_role;
  END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO unexpected
  FROM information_schema.role_table_grants
  WHERE grantee = runtime_role AND table_schema = 'public'
    AND table_name <> ALL(allowed_tables);
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'runtime role has grants outside the F1 table allowlist: %', unexpected;
  END IF;

  SELECT string_agg(table_name || ':' || privilege_type, ', ' ORDER BY table_name, privilege_type)
  INTO unexpected
  FROM information_schema.role_table_grants
  WHERE grantee = runtime_role AND table_schema = 'public'
    AND table_name = ANY(allowed_tables)
    AND privilege_type NOT IN ('SELECT', 'INSERT', 'UPDATE');
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'runtime role has disallowed privileges on an F1 table: %', unexpected;
  END IF;

  SELECT string_agg(table_name || ':' || privilege, ', ' ORDER BY table_name, privilege)
  INTO unexpected
  FROM unnest(allowed_tables) AS table_name
  CROSS JOIN (VALUES ('SELECT'), ('INSERT'), ('UPDATE')) AS p(privilege)
  WHERE NOT has_table_privilege(runtime_role, 'public.' || table_name, privilege);
  IF unexpected IS NOT NULL THEN
    RAISE EXCEPTION 'runtime role is missing F1 table privileges: %', unexpected;
  END IF;
END $$;
SQL

"$PSQL_BIN" "$RUNTIME_DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet \
  --set=tenant_id="$TENANT_ID" --set=run_id="$RUN_ID" <<'SQL'
BEGIN;
SELECT set_config('app.current_tenant', :'tenant_id', true);
SELECT 1 FROM executions WHERE tenant_id = :'tenant_id' AND id = :'run_id' || '-execution';
UPDATE executions SET status = 'running', state = 'running', version = version + 1 WHERE tenant_id = :'tenant_id' AND id = :'run_id' || '-execution';
INSERT INTO execution_steps (id, tenant_id, execution_id, step_index, step_type, status)
VALUES (:'run_id' || '-step', :'tenant_id', :'run_id' || '-execution', 1, 'llm_call', 'running');
INSERT INTO execution_checkpoints (id, tenant_id, execution_id, step_index, source, state_json, channel_versions, versions_seen, metadata_json)
VALUES (:'run_id' || '-checkpoint', :'tenant_id', :'run_id' || '-execution', 1, 'runtime-smoke', '{}'::jsonb, '{}'::jsonb, '{}'::jsonb, '{}'::jsonb);
INSERT INTO execution_checkpoint_writes (id, tenant_id, checkpoint_id, task_id, task_path, write_index, channel, type, value_json)
VALUES (:'run_id' || '-checkpoint-write', :'tenant_id', :'run_id' || '-checkpoint', 'task', '', 1, 'messages', 'tool_result', '{}'::jsonb);
INSERT INTO tool_invocations (id, tenant_id, execution_id, step_id, tool_name, tool_kind, status, args_json, idempotency_key)
VALUES (:'run_id' || '-tool', :'tenant_id', :'run_id' || '-execution', :'run_id' || '-step', 'smoke', 'builtin', 'running', '{}'::jsonb, :'run_id' || '-tool-key');
INSERT INTO approvals (id, tenant_id, execution_id, step_id, kind, status, title, reason, payload_json)
VALUES (:'run_id' || '-approval', :'tenant_id', :'run_id' || '-execution', :'run_id' || '-step', 'tool', 'pending', 'smoke', 'smoke', '{}'::jsonb);
INSERT INTO outbox_events (id, tenant_id, aggregate_type, aggregate_id, event_type, sequence, payload_json)
VALUES (:'run_id' || '-outbox', :'tenant_id', 'execution', :'run_id' || '-execution', 'RuntimeRoleSmoke', 1, '{}'::jsonb);
INSERT INTO worker_heartbeats (id, worker_type, instance_id, status, started_at, last_heartbeat_at, metadata)
VALUES (:'run_id' || '-heartbeat', 'runtime-worker', :'run_id', 'ok', now(), now(), '{}'::jsonb);
ROLLBACK;
SQL

"$PSQL_BIN" "$RUNTIME_DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet <<'SQL'
DO $$
BEGIN
  BEGIN
    CREATE TABLE f1_runtime_role_smoke_forbidden(id text);
    RAISE EXCEPTION 'runtime role unexpectedly created a table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    CREATE TEMPORARY TABLE f1_runtime_role_smoke_forbidden_temp(id text);
    RAISE EXCEPTION 'runtime role unexpectedly created a temporary table';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    ALTER TABLE executions ADD COLUMN f1_runtime_role_smoke_forbidden text;
    RAISE EXCEPTION 'runtime role unexpectedly altered executions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    DROP TABLE executions;
    RAISE EXCEPTION 'runtime role unexpectedly dropped executions';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM 1 FROM agents LIMIT 1;
    RAISE EXCEPTION 'runtime role unexpectedly accessed agents';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  BEGIN
    PERFORM 1 FROM drizzle.__drizzle_migrations LIMIT 1;
    RAISE EXCEPTION 'runtime role unexpectedly accessed migration metadata';
  EXCEPTION WHEN insufficient_privilege OR undefined_schema OR undefined_table THEN NULL;
  END;
END $$;
SQL

echo "f1-runtime-db-role-smoke passed for role ${RUNTIME_POSTGRES_USER}"
