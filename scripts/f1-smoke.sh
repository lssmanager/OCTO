#!/usr/bin/env bash
set -euo pipefail

MODE="${F1_SMOKE_MODE:-health}"
if [[ "${1:-}" == "--strict" ]]; then
  MODE="strict"
elif [[ "${1:-}" == "--health" || "${1:-}" == "" ]]; then
  MODE="health"
else
  echo "Usage: $0 [--health|--strict]" >&2
  exit 64
fi

derive_api_root_url() {
  local api_url="${1%/}"
  if [[ "$api_url" == */api ]]; then
    printf '%s' "${api_url%/api}"
  else
    printf '%s' "$api_url"
  fi
}

F1_WEB_URL="${F1_WEB_URL:-${F1_PUBLIC_URL:-http://localhost:3000}}"
API_URL="${API_URL:-http://localhost:3001/api}"
API_ROOT_URL="${API_ROOT_URL:-$(derive_api_root_url "$API_URL")}"
F1_PUBLIC_URL="${F1_PUBLIC_URL:-$F1_WEB_URL}"
RUNTIME_URL="${RUNTIME_PUBLIC_URL:-http://localhost:8000}"
SCHEDULER_URL="${SCHEDULER_PUBLIC_URL:-http://localhost:3003}"
OUTBOX_URL="${OUTBOX_PUBLIC_URL:-http://localhost:3010}"
RECLAIMER_URL="${RECLAIMER_PUBLIC_URL:-http://localhost:3011}"
TENANT_ID="${F1_SMOKE_TENANT_ID:-tenant-f1-smoke}"
USER_ID="${F1_SMOKE_USER_ID:-user-f1-smoke}"
JWT_SECRET="${JWT_SECRET:-dev-secret}"
JWT_KID="${JWT_KID:-dev-hs256}"
OUTBOX_STREAM_KEY="${OUTBOX_STREAM_KEY:-octo.events}"
SMOKE_TIMEOUT_SECONDS="${F1_SMOKE_TIMEOUT_SECONDS:-90}"
POLL_SECONDS="${F1_SMOKE_POLL_SECONDS:-2}"

log() { printf '\n==> %s\n' "$*"; }
fail() { echo "F1 smoke failed: $*" >&2; diagnostics >&2; exit 1; }

docker_compose_available() { command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; }

diagnostics() {
  echo "--- endpoint diagnostics ---"
  for url in "$F1_WEB_URL/" "$F1_WEB_URL/status" "$F1_WEB_URL/api/health" "$API_ROOT_URL/" "$API_URL/health/live" "$API_URL/health/ready" "$API_URL/health/version" "$RUNTIME_URL/health/ready" "$SCHEDULER_URL/health/status" "$OUTBOX_URL/status" "$RECLAIMER_URL/health/status"; do
    echo "# $url"
    curl -fsS "$url" || true
    echo
  done
  if docker_compose_available; then
    echo "--- docker compose ps ---"
    docker compose ps || true
    echo "--- recent worker logs ---"
    docker compose logs --tail=120 web api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker postgres redis || true
  fi
}

assert_contains() {
  local file="$1" pattern="$2" message="$3"
  if ! grep -qi "$pattern" "$file"; then
    cat "$file" >&2 || true
    fail "$message"
  fi
}

assert_web_surface() {
  local body_file status
  body_file="$(mktemp)"
  log "checking F1 web Agent Graph Console: $F1_WEB_URL/"
  status="$(curl -sS -o "$body_file" -w '%{http_code}' "$F1_WEB_URL/" || true)"
  if [[ "$status" != "200" ]]; then
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    fail "F1 web root must return HTTP 200 (got ${status:-curl-error})"
  fi
  if grep -qi 'Cannot GET /' "$body_file"; then
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    fail "F1 web root returned a missing-root response instead of the Agent Graph Console"
  fi
  assert_contains "$body_file" 'Agent Graph Console' 'F1 web root is missing Agent Graph Console marker'
  assert_contains "$body_file" 'F1' 'F1 web root is missing F1 marker'
  assert_contains "$body_file" 'Agent Graph System' 'F1 web root is missing Agent Graph System marker'
  rm -f "$body_file"
}

assert_web_status_surface() {
  local body_file status
  body_file="$(mktemp)"
  log "checking F1 web foundation status: $F1_WEB_URL/status"
  status="$(curl -sS -o "$body_file" -w '%{http_code}' "$F1_WEB_URL/status" || true)"
  if [[ "$status" != "200" ]]; then
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    fail "F1 web /status must return HTTP 200 (got ${status:-curl-error})"
  fi
  if grep -qi 'Cannot GET /' "$body_file"; then
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    fail "F1 web /status returned a missing-route response"
  fi
  assert_contains "$body_file" 'Services' 'F1 web /status is missing services status marker'
  assert_contains "$body_file" 'Foundation\|Infrastructure\|Control Plane' 'F1 web /status is missing foundation status marker'
  rm -f "$body_file"
}

assert_root_surface() {
  local name="$1" url="$2" body_file status
  body_file="$(mktemp)"
  log "checking ${name}: ${url}"
  status="$(curl -sS -o "$body_file" -w '%{http_code}' "$url" || true)"
  if [[ "$status" != "200" ]]; then
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    fail "${name} must return HTTP 200 (got ${status:-curl-error})"
  fi
  if grep -qi 'Cannot GET /' "$body_file"; then
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    fail "${name} returned the NestJS missing-root response"
  fi
  if ! grep -qi 'OCTO' "$body_file"; then
    cat "$body_file" >&2 || true
    rm -f "$body_file"
    fail "${name} does not expose the OCTO operational surface"
  fi
  rm -f "$body_file"
}

assert_version_metadata() {
  local file phase version commit built_at
  file="$(mktemp)"
  log "checking API version metadata: $API_URL/health/version"
  curl -fsS "$API_URL/health/version" -o "$file"
  phase="$(json_field "$file" phase)"
  version="$(json_field "$file" version)"
  commit="$(json_field "$file" commit)"
  built_at="$(json_field "$file" built_at)"
  if [[ "$MODE" == "strict" || "${F1_CLOSE_GATE:-0}" == "1" ]]; then
    [[ "$phase" == "F1" ]] || { rm -f "$file"; fail "strict F1 smoke requires phase=F1 (got ${phase})"; }
    [[ "$version" != "unknown" && -n "$version" ]] || { rm -f "$file"; fail "strict F1 smoke requires non-unknown version"; }
    [[ "$commit" != "unknown" && -n "$commit" ]] || { rm -f "$file"; fail "strict F1 smoke requires non-unknown commit"; }
    [[ "$built_at" != "unknown" && -n "$built_at" ]] || { rm -f "$file"; fail "strict F1 smoke requires non-unknown built_at"; }
    assert_root_metadata_matches_version "$file" "$phase" "$version" "$commit" "$built_at"
  fi
  rm -f "$file"
}

assert_root_metadata_matches_version() {
  local version_file="$1" phase="$2" version="$3" commit="$4" built_at="$5" root_file commit_short
  root_file="$(mktemp)"
  commit_short="$commit"
  if (( ${#commit_short} > 12 )); then
    commit_short="${commit_short:0:12}"
  fi
  log "checking root public status metadata coherence: $API_ROOT_URL/"
  curl -fsS "$API_ROOT_URL/" -o "$root_file"
  grep -qi 'OCTO' "$root_file" || { rm -f "$root_file"; fail "root public status surface is missing OCTO marker"; }
  grep -q "Phase</dt><dd><code>${phase}</code>" "$root_file" || { rm -f "$root_file"; fail "root public status surface does not report phase ${phase}"; }
  grep -q "Version</dt><dd><code>${version}</code>" "$root_file" || { rm -f "$root_file"; fail "root public status surface does not report version ${version}"; }
  grep -q "Commit</dt><dd><code>${commit_short}</code>" "$root_file" || { rm -f "$root_file"; fail "root public status surface does not report commit ${commit_short}"; }
  grep -q "Built at</dt><dd><code>${built_at}</code>" "$root_file" || { rm -f "$root_file"; fail "root public status surface does not report build time ${built_at}"; }
  node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); for (const key of ["phase","version","commit","built_at"]) if (!data[key]) process.exit(1);' "$version_file" || { rm -f "$root_file"; fail "version endpoint metadata is incomplete"; }
  rm -f "$root_file"
}

wait_http() {
  local name="$1" url="$2" deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  log "waiting for ${name}: ${url}"
  until curl -fsS "$url" >/dev/null; do
    if (( SECONDS >= deadline )); then
      fail "timeout waiting for ${name} at ${url}"
    fi
    sleep "$POLL_SECONDS"
  done
}

compose_psql() {
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U "${POSTGRES_USER:-octo}" -d "${POSTGRES_DB:-octo}" "$@"
}

sql_value() {
  compose_psql -At -c "$1"
}

json_field() {
  node -e 'const fs=require("fs"); const path=process.argv[1]; const key=process.argv[2]; const data=JSON.parse(fs.readFileSync(path,"utf8")); const value=key.split(".").reduce((acc,k)=>acc && acc[k], data); if (value === undefined || value === null) process.exit(2); process.stdout.write(String(value));' "$1" "$2"
}

make_uuid() { node -e 'process.stdout.write(require("crypto").randomUUID())'; }

make_jwt() {
  node - <<'NODE'
const crypto = require('crypto');
const secret = process.env.JWT_SECRET || 'dev-secret';
const kid = process.env.JWT_KID || 'dev-hs256';
const now = Math.floor(Date.now() / 1000);
const enc = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
const header = enc({ alg: 'HS256', typ: 'JWT', kid });
const payload = enc({
  sub: process.env.F1_SMOKE_USER_ID || 'user-f1-smoke',
  tenant_id: process.env.F1_SMOKE_TENANT_ID || 'tenant-f1-smoke',
  roles: ['tenant_admin'],
  scopes: ['agents:read', 'agents:write', 'executions:read', 'executions:write', 'ops:read', 'ops:write'],
  iss: 'octo-f1-smoke',
  aud: 'octo-api',
  iat: now,
  exp: now + 3600,
  jti: crypto.randomUUID(),
});
const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
process.stdout.write(`${header}.${payload}.${sig}`);
NODE
}

api_post_json() {
  local path="$1" body="$2" output="$3"
  curl -fsS -X POST "$API_URL$path" \
    -H "authorization: Bearer $TOKEN" \
    -H 'content-type: application/json' \
    --data "$body" \
    -o "$output"
}

api_get_json() {
  local path="$1" output="$2"
  curl -fsS "$API_URL$path" -H "authorization: Bearer $TOKEN" -o "$output"
}

seed_agent() {
  AGENT_ID="$(make_uuid)"
  AGENT_VERSION_ID="$(make_uuid)"
  log "seeding smoke agent via PostgreSQL (agent=${AGENT_ID}, version=${AGENT_VERSION_ID})"
  compose_psql <<SQL
INSERT INTO agents (id, tenant_id, name, description, role, goal, capabilities, governance_policy, metadata)
VALUES ('${AGENT_ID}', '${TENANT_ID}', 'F1 Smoke Agent', 'seeded by F1 close gate', 'executor', 'complete the F1 smoke run', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb);
INSERT INTO agent_versions (id, tenant_id, agent_id, version, config_json)
VALUES ('${AGENT_VERSION_ID}', '${TENANT_ID}', '${AGENT_ID}', 1,
  '{"modelPolicy":{"primaryModel":"fake/f1-test","allowedModels":["fake/f1-test"],"registeredModels":["fake/f1-test"]},"toolPolicy":{"allow":["builtin.echo"]},"budgetPolicy":{"maxUsdPerRun":"0.01"},"instructions":"F1 smoke deterministic agent"}'::jsonb);
SQL
}

wait_execution_completed() {
  local execution_id="$1" deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS)) status_file
  status_file="$(mktemp)"
  log "waiting for execution ${execution_id} to reach durable terminal state"
  while true; do
    api_get_json "/v1/executions/${execution_id}" "$status_file" || true
    local status=""
    status="$(json_field "$status_file" status 2>/dev/null || true)"
    echo "execution ${execution_id} status=${status:-unknown}"
    if [[ "$status" == "completed" ]]; then
      rm -f "$status_file"
      return 0
    fi
    if [[ "$status" == "failed" || "$status" == "cancelled" ]]; then
      cat "$status_file" >&2 || true
      rm -f "$status_file"
      fail "execution ${execution_id} reached terminal status ${status}"
    fi
    if (( SECONDS >= deadline )); then
      cat "$status_file" >&2 || true
      rm -f "$status_file"
      fail "timeout waiting for execution ${execution_id} completion"
    fi
    sleep "$POLL_SECONDS"
  done
}

wait_sql_count() {
  local description="$1" sql="$2" min_count="$3" deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  log "waiting for ${description}"
  while true; do
    local count
    count="$(sql_value "$sql" | tr -d '[:space:]')"
    echo "${description}: ${count}"
    if [[ "${count:-0}" =~ ^[0-9]+$ ]] && (( count >= min_count )); then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      fail "timeout waiting for ${description}; last count=${count:-unknown}"
    fi
    sleep "$POLL_SECONDS"
  done
}

create_execution_via_api() {
  local output_file execution_body
  output_file="$(mktemp)"
  TRACE_ID="trace-$(make_uuid)"
  CORRELATION_ID="corr-$(make_uuid)"
  export TRACE_ID CORRELATION_ID
  execution_body="{\"agentId\":\"${AGENT_ID}\",\"agentVersionId\":\"${AGENT_VERSION_ID}\",\"traceId\":\"${TRACE_ID}\",\"correlationId\":\"${CORRELATION_ID}\",\"input\":{\"prompt\":\"Run the F1 close-gate smoke path with a deterministic tool call.\"}}"
  log "creating execution through Control Plane API"
  api_post_json "/v1/executions" "$execution_body" "$output_file"
  EXECUTION_ID="$(json_field "$output_file" id)"
  rm -f "$output_file"
  echo "created execution ${EXECUTION_ID} trace=${TRACE_ID} correlation=${CORRELATION_ID}"
}

verify_execution_evidence() {
  local execution_id="$1" timeline_file
  timeline_file="$(mktemp)"
  api_get_json "/v1/executions/${execution_id}/timeline" "$timeline_file"
  node - "$timeline_file" <<'NODE' || fail "timeline missing required F1 events"
const fs = require('fs');
const file = process.argv[2];
const events = JSON.parse(fs.readFileSync(file, 'utf8'));
const expectedTrace = process.env.TRACE_ID;
const expectedCorrelation = process.env.CORRELATION_ID;
const types = events.map((event) => event.eventType);
for (const required of ['ExecutionQueued', 'ExecutionDispatched', 'ExecutionStarted', 'ExecutionCheckpointed', 'ExecutionSucceeded']) {
  if (!types.includes(required)) {
    console.error(`missing ${required}; saw ${types.join(',')}`);
    process.exit(1);
  }
}
if (!events.every((event) => event.payloadJson?._meta?.traceId === expectedTrace)) {
  console.error('timeline events are not trace-correlated');
  process.exit(1);
}
if (!events.every((event) => event.payloadJson?._meta?.correlationId === expectedCorrelation)) {
  console.error('timeline events are not correlationId-correlated');
  process.exit(1);
}
NODE
  rm -f "$timeline_file"

  wait_sql_count "checkpoint rows for ${execution_id}" "SELECT count(*) FROM execution_checkpoints WHERE tenant_id='${TENANT_ID}' AND execution_id='${execution_id}'" 2
  wait_sql_count "checkpoint write rows for ${execution_id}" "SELECT count(*) FROM execution_checkpoint_writes WHERE tenant_id='${TENANT_ID}' AND task_id='${execution_id}'" 1
  wait_sql_count "tool invocation rows for ${execution_id}" "SELECT count(*) FROM tool_invocations WHERE tenant_id='${TENANT_ID}' AND execution_id='${execution_id}' AND status='COMPLETED'" 1
  wait_sql_count "published outbox rows for ${execution_id}" "SELECT count(*) FROM outbox_events WHERE tenant_id='${TENANT_ID}' AND aggregate_id='${execution_id}' AND published_at IS NOT NULL" 5

  local ops_file trace_file
  ops_file="$(mktemp)"
  api_get_json "/v1/ops/executions/${execution_id}/observability" "$ops_file"
  node - "$ops_file" <<'NODE' || fail "ops observability endpoint missing execution evidence"
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!data.execution || data.execution.id !== process.env.EXECUTION_ID) process.exit(1);
if (!Array.isArray(data.timeline) || data.timeline.length < 5) process.exit(1);
if (!data.queue || data.queue.source !== 'bullmq') process.exit(1);
NODE
  rm -f "$ops_file"
  trace_file="$(mktemp)"
  api_get_json "/v1/ops/traces/${TRACE_ID}" "$trace_file"
  node - "$trace_file" <<'NODE' || fail "ops trace endpoint missing execution evidence"
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (data.traceId !== process.env.TRACE_ID) process.exit(1);
if (!Array.isArray(data.executions) || !data.executions.some((row) => row.id === process.env.EXECUTION_ID)) process.exit(1);
NODE
  rm -f "$trace_file"

  if docker_compose_available; then
    local stream_len
    stream_len="$(docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD:-}" --no-auth-warning XLEN "$OUTBOX_STREAM_KEY" | tr -d '[:space:]' || true)"
    echo "Redis stream ${OUTBOX_STREAM_KEY} length=${stream_len:-unknown}"
    [[ "${stream_len:-0}" =~ ^[0-9]+$ ]] && (( stream_len >= 1 )) || fail "outbox publisher did not publish to Redis stream ${OUTBOX_STREAM_KEY}"
  fi
}

seed_reclaim_candidate() {
  RECLAIM_EXECUTION_ID="$(make_uuid)"
  log "seeding expired running execution for reclaim (${RECLAIM_EXECUTION_ID})"
  compose_psql <<SQL
INSERT INTO executions (
  id, tenant_id, agent_id, agent_version_id, state, status, version, input_json, task,
  context_snapshot_json, budget_snapshot_json, governance, created_by, queue_job_id,
  trace_id, run_id, attempt, attempt_count, reclaim_count, lease_owner, lease_token, worker_id,
  lease_expires_at, started_at, updated_at
) VALUES (
  '${RECLAIM_EXECUTION_ID}', '${TENANT_ID}', '${AGENT_ID}', '${AGENT_VERSION_ID}', 'running', 'running', 1,
  '{"prompt":"recover me"}'::jsonb, '{"prompt":"recover me"}'::jsonb,
  '{"agentId":"${AGENT_ID}","agentVersion":1,"workspaceId":"","instructions":"reclaim smoke","modelPolicy":{"primaryModel":"fake/f1-test","allowedModels":["fake/f1-test"],"registeredModels":["fake/f1-test"]},"toolPolicy":{"allow":["builtin.echo"],"deny":[]},"budgetPolicy":{"maxUsdPerRun":"0.01"},"governance":{},"hierarchySnapshot":{"chain":[]},"schemaVersion":2,"resolvedAt":"smoke"}'::jsonb,
  '{"maxUsdPerRun":"0.01"}'::jsonb, '{}'::jsonb, '${USER_ID}', '${RECLAIM_EXECUTION_ID}',
  'trace-${RECLAIM_EXECUTION_ID}', 'run-${RECLAIM_EXECUTION_ID}', 0, 0, 0,
  'dead-worker', 'dead-token-${RECLAIM_EXECUTION_ID}', 'dead-worker', NOW() - interval '5 minutes', NOW() - interval '10 minutes', NOW() - interval '5 minutes'
);
SQL
}

wait_reclaim_completed() {
  local deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  log "waiting for reclaimer -> scheduler -> runtime replay of ${RECLAIM_EXECUTION_ID}"
  while true; do
    local row status reclaim_count
    row="$(sql_value "SELECT status || '|' || reclaim_count FROM executions WHERE tenant_id='${TENANT_ID}' AND id='${RECLAIM_EXECUTION_ID}'" || true)"
    status="${row%%|*}"
    reclaim_count="${row##*|}"
    echo "reclaim execution ${RECLAIM_EXECUTION_ID} status=${status:-unknown} reclaim_count=${reclaim_count:-unknown}"
    if [[ "$status" == "completed" && "${reclaim_count:-0}" =~ ^[0-9]+$ && "$reclaim_count" -ge 1 ]]; then
      break
    fi
    if [[ "$status" == "failed" || "$status" == "cancelled" ]]; then
      fail "reclaim candidate reached ${status}"
    fi
    if (( SECONDS >= deadline )); then
      fail "timeout waiting for reclaim completion"
    fi
    sleep "$POLL_SECONDS"
  done
  wait_sql_count "reclaim dispatch event for ${RECLAIM_EXECUTION_ID}" "SELECT count(*) FROM outbox_events WHERE tenant_id='${TENANT_ID}' AND aggregate_id='${RECLAIM_EXECUTION_ID}' AND event_type='ExecutionDispatched' AND payload_json->>'mode'='reclaim'" 1
  wait_sql_count "published reclaim outbox rows for ${RECLAIM_EXECUTION_ID}" "SELECT count(*) FROM outbox_events WHERE tenant_id='${TENANT_ID}' AND aggregate_id='${RECLAIM_EXECUTION_ID}' AND published_at IS NOT NULL" 4
}

run_health_smoke() {
  log "F1 smoke: web+api public surface and health endpoints"
  wait_http "F1 web health" "$F1_WEB_URL/api/health"
  assert_web_surface
  assert_web_status_surface
  assert_root_surface "API root operational surface" "$API_ROOT_URL/"
  wait_http "API live" "$API_URL/health/live"
  wait_http "API ready" "$API_URL/health/ready"
  wait_http "API version" "$API_URL/health/version"
  assert_version_metadata
  wait_http "runtime live" "$RUNTIME_URL/health/live"
  wait_http "scheduler live" "$SCHEDULER_URL/health/live"
  wait_http "scheduler ready" "$SCHEDULER_URL/health/ready"
}

run_strict_smoke() {
  docker_compose_available || fail "strict smoke requires docker compose for SQL and service diagnostics"
  run_health_smoke
  wait_http "runtime ready" "$RUNTIME_URL/health/ready"
  wait_http "outbox publisher ready" "$OUTBOX_URL/health/ready"
  wait_http "reclaimer ready" "$RECLAIMER_URL/health/ready"

  wait_sql_count "fresh scheduler heartbeat" "SELECT count(*) FROM worker_heartbeats WHERE worker_type='scheduler-worker' AND last_heartbeat_at > NOW() - interval '30 seconds'" 1
  wait_sql_count "fresh runtime heartbeat" "SELECT count(*) FROM worker_heartbeats WHERE worker_type='runtime-worker' AND last_heartbeat_at > NOW() - interval '30 seconds'" 1
  wait_sql_count "fresh reclaimer heartbeat" "SELECT count(*) FROM worker_heartbeats WHERE worker_type='reclaimer-worker' AND last_heartbeat_at > NOW() - interval '30 seconds'" 1

  TOKEN="$(make_jwt)"
  export TOKEN
  seed_agent
  create_execution_via_api
  wait_execution_completed "$EXECUTION_ID"
  verify_execution_evidence "$EXECUTION_ID"

  seed_reclaim_candidate
  wait_reclaim_completed

  log "F1 strict smoke passed: web Agent Graph Console + /status and API -> queue -> scheduler -> runtime -> PostgreSQL -> outbox -> reclaimer verified"
}

if [[ "$MODE" == "strict" ]]; then
  run_strict_smoke
else
  run_health_smoke
fi
