#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3001/api}"
RUNTIME_WORKER_URL="${RUNTIME_WORKER_URL:-${RUNTIME_PUBLIC_URL:-http://localhost:8000}}"
INTERNAL_SECRET="${INTERNAL_SECRET:-}"
DATABASE_URL="${DATABASE_URL:-}"
TENANT_ID="${F1_HANDOFF_TENANT_ID:-tenant-f1-handoff-smoke}"
AGENT_ID="${F1_HANDOFF_AGENT_ID:-agent-f1-handoff-smoke}"
WORKSPACE_ID="${F1_HANDOFF_WORKSPACE_ID:-workspace-f1}"
TIMEOUT_SECONDS="${F1_HANDOFF_TIMEOUT_SECONDS:-45}"
POLL_SECONDS="${F1_HANDOFF_POLL_SECONDS:-2}"

log() { printf '\n==> %s\n' "$*"; }
fail() { echo "F1 runtime handoff smoke failed: $*" >&2; exit 1; }

require_secret() {
  [[ -n "$INTERNAL_SECRET" ]] || fail "INTERNAL_SECRET is required"
}

json_field() {
  local file="$1" expr="$2"
  node -e "const fs=require('fs'); const data=JSON.parse(fs.readFileSync(process.argv[1],'utf8')); const value=${expr}; if (value === undefined || value === null) process.exit(1); process.stdout.write(String(value));" "$file"
}

make_uuid() {
  node -e "console.log(require('crypto').randomUUID())"
}

internal_get_json() {
  local url="$1" output="$2" status deadline
  deadline=$((SECONDS + TIMEOUT_SECONDS))
  while true; do
    status="$(curl -sS -o "$output" -w '%{http_code}' -H "X-Internal-Secret: ${INTERNAL_SECRET}" "$url" || true)"
    if [[ "$status" == "200" ]]; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      cat "$output" >&2 || true
      fail "GET $url returned HTTP ${status:-curl-error}"
    fi
    sleep "$POLL_SECONDS"
  done
}

verify_api_runtime_surface() {
  local file
  file="$(mktemp)"
  log "checking API runtime health surface"
  internal_get_json "${API_URL%/}/v1/runtime/health" "$file"
  node - "$file" <<'NODE' || { cat "$file" >&2 || true; fail "API /v1/runtime/health must return JSON status"; }
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (!data || typeof data !== 'object') process.exit(1);
NODE
  rm -f "$file"

  file="$(mktemp)"
  log "checking API runtime workers surface"
  internal_get_json "${API_URL%/}/v1/runtime/workers" "$file"
  node - "$file" <<'NODE' || { cat "$file" >&2 || true; fail "API /v1/runtime/workers must include runtime-worker heartbeat evidence"; }
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const workers = Array.isArray(data) ? data : (Array.isArray(data.workers) ? data.workers : []);
if (!workers.some((w) => w.name === 'runtime-worker' || w.workerType === 'runtime-worker' || w.worker_type === 'runtime-worker')) process.exit(1);
NODE
  rm -f "$file"
}

verify_runtime_health() {
  local file
  for path in /health/live /health/ready /health/status; do
    file="$(mktemp)"
    log "checking runtime-worker ${path}"
    local status deadline
    deadline=$((SECONDS + TIMEOUT_SECONDS))
    while true; do
      if [[ "$path" == "/health/live" ]]; then
        status="$(curl -sS -o "$file" -w '%{http_code}' "${RUNTIME_WORKER_URL%/}${path}" || true)"
      else
        status="$(curl -sS -o "$file" -w '%{http_code}' -H "X-Internal-Secret: ${RUNTIME_API_SECRET}" "${RUNTIME_WORKER_URL%/}${path}" || true)"
      fi
      if [[ "$status" == "200" ]]; then
        break
      fi
      if (( SECONDS >= deadline )); then
        cat "$file" >&2 || true
        fail "runtime-worker ${path} returned HTTP ${status:-curl-error}"
      fi
      sleep "$POLL_SECONDS"
    done
    if [[ "$path" == "/health/status" ]]; then
      node - "$file" <<'NODE' || { cat "$file" >&2 || true; fail "runtime-worker /health/status missing F1 runtime evidence"; }
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (data.workerType !== 'runtime-worker') process.exit(1);
if (data.phase !== 'F1') process.exit(1);
if (!data.database?.runtimeDatabaseUrlConfigured) process.exit(1);
if (data.database?.credential !== 'RUNTIME_DATABASE_URL') process.exit(1);
NODE
    fi
    rm -f "$file"
  done
}

verify_direct_handoff_202() {
  local execution_id trace_id run_id request_file response_file status
  execution_id="$(make_uuid)"
  trace_id="trace-${execution_id}"
  run_id="run-${execution_id}"
  request_file="$(mktemp)"
  response_file="$(mktemp)"
  cat > "$request_file" <<JSON
{
  "executionId": "${execution_id}",
  "tenantId": "${TENANT_ID}",
  "agentId": "${AGENT_ID}",
  "workspaceId": "${WORKSPACE_ID}",
  "task": "F1 handoff acceptance smoke; background execution may fail if the test execution was not pre-seeded.",
  "context": {"source": "scripts/f1-runtime-handoff-smoke.sh", "f1Only": true},
  "tools": [],
  "streaming": false,
  "traceId": "${trace_id}",
  "correlationId": "corr-${execution_id}",
  "runId": "${run_id}",
  "queueJobId": "handoff-smoke-${execution_id}",
  "mode": "normal",
  "reason": "dispatch",
  "leaseOwner": "scheduler-worker-handoff-smoke",
  "leaseToken": "handoff-smoke-token-${execution_id}",
  "attempt": 1
}
JSON
  log "posting direct F1 HTTP handoff to runtime-worker"
  status="$(curl -sS -o "$response_file" -w '%{http_code}' \
    -H 'Content-Type: application/json' \
    -H "X-Internal-Secret: ${INTERNAL_SECRET}" \
    --data-binary "@$request_file" \
    "${RUNTIME_WORKER_URL%/}/api/v1/execute" || true)"
  [[ "$status" == "202" ]] || { cat "$response_file" >&2 || true; fail "runtime-worker handoff returned HTTP ${status:-curl-error}, expected 202"; }
  [[ "$(json_field "$response_file" 'data.status')" == "accepted" ]] || { cat "$response_file" >&2 || true; fail "runtime-worker handoff response must be accepted"; }
  rm -f "$request_file" "$response_file"
}

verify_db_heartbeat() {
  [[ -n "$DATABASE_URL" ]] || { log "WARNING: DATABASE_URL not set; skipping optional host-side worker_heartbeats SQL verification (HTTP/runtime status checks still ran)"; return 0; }
  command -v psql >/dev/null 2>&1 || { log "WARNING: psql not installed; skipping optional host-side worker_heartbeats SQL verification (HTTP/runtime status checks still ran)"; return 0; }
  local deadline=$((SECONDS + TIMEOUT_SECONDS)) count
  log "waiting for runtime-worker heartbeat in worker_heartbeats via host DATABASE_URL"
  while true; do
    count="$(psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --tuples-only --no-align -c "SELECT count(*) FROM worker_heartbeats WHERE worker_type='runtime-worker' AND last_heartbeat_at > NOW() - interval '60 seconds'" | tr -d '[:space:]')"
    if [[ "$count" =~ ^[0-9]+$ ]] && (( count >= 1 )); then
      return 0
    fi
    (( SECONDS < deadline )) || fail "runtime-worker heartbeat was not observed in worker_heartbeats"
    sleep "$POLL_SECONDS"
  done
}

require_secret
verify_runtime_health
verify_direct_handoff_202
verify_api_runtime_surface
verify_db_heartbeat
log "F1 runtime handoff smoke passed (HTTP 202 + runtime status + heartbeat evidence)"
