#!/usr/bin/env bash
set -euo pipefail

API_URL="${API_URL:-http://localhost:3001/api}"
API_ROOT_URL="${API_ROOT_URL:-${API_URL%/api}}"
RUNTIME_URL="${RUNTIME_PUBLIC_URL:-http://localhost:8000}"
SCHEDULER_URL="${SCHEDULER_PUBLIC_URL:-http://localhost:3003}"
OUTBOX_URL="${OUTBOX_PUBLIC_URL:-http://localhost:3010}"
RECLAIMER_URL="${RECLAIMER_PUBLIC_URL:-http://localhost:3011}"
DATABASE_URL="${F1_HOST_DATABASE_URL:-${DATABASE_URL:-}}"
REDIS_URL="${F1_HOST_REDIS_URL:-${REDIS_URL:-}}"
PSQL_BIN="${PSQL_BIN:-psql}"
JWT_SECRET="${JWT_SECRET:-dev-secret}"
JWT_KID="${JWT_KID:-dev-hs256}"
TENANT_ID="${F1_QUEUE_WORKERS_SMOKE_TENANT_ID:-tenant-f1-queue-workers-smoke}"
USER_ID="${F1_QUEUE_WORKERS_SMOKE_USER_ID:-user-f1-queue-workers-smoke}"
OUTBOX_STREAM_KEY="${OUTBOX_STREAM_KEY:-octo.events}"
SMOKE_TIMEOUT_SECONDS="${F1_QUEUE_WORKERS_SMOKE_TIMEOUT_SECONDS:-90}"
POLL_SECONDS="${F1_QUEUE_WORKERS_SMOKE_POLL_SECONDS:-2}"
HEARTBEAT_MAX_AGE_SECONDS="${F1_WORKER_HEARTBEAT_MAX_AGE_SECONDS:-45}"

if [[ -z "$DATABASE_URL" ]]; then
  echo "F1 queue workers smoke requires F1_HOST_DATABASE_URL or DATABASE_URL for host-side PostgreSQL checks" >&2
  exit 64
fi
if [[ -z "$REDIS_URL" ]]; then
  echo "F1 queue workers smoke requires F1_HOST_REDIS_URL or REDIS_URL for host-side Redis/BullMQ checks" >&2
  exit 64
fi

log() { printf '\n==> %s\n' "$*"; }
fail() { echo "F1 queue workers smoke failed: $*" >&2; diagnostics >&2; exit 1; }

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

json_field() {
  node -e 'const fs=require("fs"); const data=JSON.parse(fs.readFileSync(process.argv[1],"utf8")); const value=process.argv[2].split(".").reduce((acc,k)=>acc && acc[k], data); if (value === undefined || value === null) process.exit(2); process.stdout.write(String(value));' "$1" "$2"
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
  sub: process.env.USER_ID || process.env.F1_QUEUE_WORKERS_SMOKE_USER_ID || 'user-f1-queue-workers-smoke',
  tenant_id: process.env.TENANT_ID || process.env.F1_QUEUE_WORKERS_SMOKE_TENANT_ID || 'tenant-f1-queue-workers-smoke',
  roles: ['tenant_admin'],
  scopes: ['agents:read', 'agents:write', 'executions:read', 'executions:write', 'ops:read', 'ops:write'],
  iss: 'octo-f1-queue-workers-smoke',
  aud: 'octo-api',
  iat: now,
  exp: now + 3600,
  jti: crypto.randomUUID(),
});
const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
process.stdout.write(`${header}.${payload}.${sig}`);
NODE
}

psql_exec() {
  "$PSQL_BIN" "$DATABASE_URL" --set=ON_ERROR_STOP=1 --quiet "$@"
}

sql_value() {
  psql_exec -At -c "$1"
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

queue_node() {
  (cd packages/queue && REDIS_URL="$REDIS_URL" OUTBOX_STREAM_KEY="$OUTBOX_STREAM_KEY" pnpm exec node --input-type=module - "$@")
}

queue_assert() {
  queue_node "$@" <<'NODE'
import { Queue } from 'bullmq';
import IORedis from 'ioredis';
const redisUrl = process.env.REDIS_URL;
const mode = process.argv[2];
const executionId = process.argv[3];
const expectedMaxFailed = Number(process.argv[4] ?? '0');
const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
const queue = new Queue('execution.dispatch', { connection });
try {
  await connection.ping();
  if (mode === 'summary') {
    const [waiting, active, delayed, failed, completed] = await Promise.all([
      queue.getWaitingCount(), queue.getActiveCount(), queue.getDelayedCount(), queue.getFailedCount(), queue.getCompletedCount(),
    ]);
    if (failed > expectedMaxFailed) throw new Error(`execution.dispatch failed jobs=${failed} exceeds expected baseline=${expectedMaxFailed}`);
    console.log(JSON.stringify({ queue: 'execution.dispatch', waiting, active, delayed, failed, completed }));
  } else if (mode === 'job') {
    const job = await queue.getJob(executionId);
    if (!job) throw new Error(`job ${executionId} not found in execution.dispatch`);
    const state = await job.getState();
    console.log(JSON.stringify({ id: job.id, name: job.name, state, data: job.data }));
  } else if (mode === 'stream') {
    const len = await connection.xlen(process.env.OUTBOX_STREAM_KEY || 'octo.events');
    const min = Number(executionId ?? '1');
    if (len < min) throw new Error(`outbox stream length ${len} < ${min}`);
    console.log(JSON.stringify({ stream: process.env.OUTBOX_STREAM_KEY || 'octo.events', length: len }));
  } else {
    throw new Error(`unknown mode ${mode}`);
  }
} finally {
  await queue.close();
  await connection.quit();
}
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

diagnostics() {
  echo "--- F1 queue/worker endpoint diagnostics ---"
  for url in \
    "$API_URL/health/ready" \
    "$API_URL/v1/ops/f1/status" \
    "$RUNTIME_URL/health/ready" \
    "$SCHEDULER_URL/health/status" \
    "$OUTBOX_URL/status" \
    "$RECLAIMER_URL/health/status"; do
    echo "# $url"
    if [[ "$url" == *"/v1/ops/f1/status" && -n "${TOKEN:-}" ]]; then
      curl -fsS "$url" -H "authorization: Bearer $TOKEN" || true
    else
      curl -fsS "$url" || true
    fi
    echo
  done
  echo "--- recent worker heartbeats ---"
  psql_exec -At -c "SELECT worker_type || '|' || instance_id || '|' || status || '|' || last_heartbeat_at FROM worker_heartbeats ORDER BY last_heartbeat_at DESC LIMIT 10" || true
  echo "--- execution.dispatch summary ---"
  queue_assert summary "" 999999 || true
}

seed_agent() {
  AGENT_ID="$(make_uuid)"
  AGENT_VERSION_ID="$(make_uuid)"
  log "seeding F1 queue smoke agent in PostgreSQL (agent=${AGENT_ID})"
  psql_exec --set=tenant_id="$TENANT_ID" --set=agent_id="$AGENT_ID" --set=agent_version_id="$AGENT_VERSION_ID" <<'SQL'
INSERT INTO agents (id, tenant_id, name, description, role, goal, capabilities, governance_policy, metadata)
VALUES (:'agent_id', :'tenant_id', 'F1 Queue Workers Smoke Agent', 'seeded by F1 queue workers smoke', 'executor', 'verify F1 queue worker foundation', '[]'::jsonb, '{}'::jsonb, '{}'::jsonb);
INSERT INTO agent_versions (id, tenant_id, agent_id, version, config_json)
VALUES (:'agent_version_id', :'tenant_id', :'agent_id', 1,
  '{"modelPolicy":{"primaryModel":"fake/f1-test","allowedModels":["fake/f1-test"],"registeredModels":["fake/f1-test"]},"toolPolicy":{"allow":["builtin.echo"],"deny":[]},"budgetPolicy":{"maxUsdPerRun":"0.01"},"instructions":"F1 queue workers deterministic smoke"}'::jsonb);
SQL
}

assert_fresh_heartbeats() {
  log "checking fresh durable worker heartbeats in PostgreSQL"
  wait_sql_count "fresh scheduler-worker heartbeat" "SELECT count(*) FROM worker_heartbeats WHERE worker_type='scheduler-worker' AND status='ok' AND last_heartbeat_at > NOW() - (${HEARTBEAT_MAX_AGE_SECONDS}::int * interval '1 second')" 1
  wait_sql_count "fresh reclaimer-worker heartbeat" "SELECT count(*) FROM worker_heartbeats WHERE worker_type='reclaimer-worker' AND status='ok' AND last_heartbeat_at > NOW() - (${HEARTBEAT_MAX_AGE_SECONDS}::int * interval '1 second')" 1
  wait_sql_count "fresh runtime-worker heartbeat" "SELECT count(*) FROM worker_heartbeats WHERE worker_type='runtime-worker' AND status='ok' AND last_heartbeat_at > NOW() - (${HEARTBEAT_MAX_AGE_SECONDS}::int * interval '1 second')" 1
}

assert_ops_status() {
  local file
  file="$(mktemp)"
  log "checking API ops F1 status sees queue and durable worker heartbeats"
  api_get_json "/v1/ops/f1/status?windowMinutes=5" "$file"
  node - "$file" <<'NODE' || { cat "$file" >&2 || true; rm -f "$file"; fail "ops F1 status must report execution.dispatch plus runtime/scheduler/reclaimer as ok"; }
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const failures = [];
if (data.queues?.executionDispatch?.name !== 'execution.dispatch') failures.push('missing execution.dispatch queue');
if (!['ok', 'degraded'].includes(data.queues?.executionDispatch?.status)) failures.push(`bad queue status ${data.queues?.executionDispatch?.status}`);
for (const worker of ['runtime', 'scheduler', 'reclaimer']) {
  if (data.workers?.[worker]?.status !== 'ok') failures.push(`${worker} status=${data.workers?.[worker]?.status}`);
}
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
NODE
  rm -f "$file"
}

create_execution_via_api() {
  local output_file execution_body
  output_file="$(mktemp)"
  TRACE_ID="trace-$(make_uuid)"
  CORRELATION_ID="corr-$(make_uuid)"
  export TRACE_ID CORRELATION_ID
  execution_body="{\"agentId\":\"${AGENT_ID}\",\"agentVersionId\":\"${AGENT_VERSION_ID}\",\"traceId\":\"${TRACE_ID}\",\"correlationId\":\"${CORRELATION_ID}\",\"input\":{\"prompt\":\"F1 queue workers smoke: verify durable dispatch handoff only.\"}}"
  log "creating F1 execution through Control Plane API"
  api_post_json "/v1/executions" "$execution_body" "$output_file"
  EXECUTION_ID="$(json_field "$output_file" id)"
  rm -f "$output_file"
  echo "created execution ${EXECUTION_ID} trace=${TRACE_ID} correlation=${CORRELATION_ID}"
}

wait_job_present() {
  local job_id="$1" deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  log "waiting for deterministic BullMQ job ${job_id} in execution.dispatch"
  while true; do
    if queue_assert job "$job_id"; then
      return 0
    fi
    if (( SECONDS >= deadline )); then
      fail "timeout waiting for execution.dispatch job ${job_id}"
    fi
    sleep "$POLL_SECONDS"
  done
}

wait_dispatch_handoff() {
  local deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  log "waiting for scheduler dispatch and runtime handoff evidence for ${EXECUTION_ID}"
  while true; do
    local row status dispatched_events steps
    row="$(sql_value "SELECT status || '|' || COALESCE(queue_job_id,'') || '|' || COALESCE(worker_id,'') FROM executions WHERE tenant_id='${TENANT_ID}' AND id='${EXECUTION_ID}'" || true)"
    status="${row%%|*}"
    dispatched_events="$(sql_value "SELECT count(*) FROM outbox_events WHERE tenant_id='${TENANT_ID}' AND aggregate_id='${EXECUTION_ID}' AND event_type='ExecutionDispatched' AND payload_json->>'mode'='normal'" | tr -d '[:space:]')"
    steps="$(sql_value "SELECT count(*) FROM execution_steps WHERE tenant_id='${TENANT_ID}' AND execution_id='${EXECUTION_ID}' AND state_to='dispatched'" | tr -d '[:space:]')"
    echo "execution ${EXECUTION_ID} status=${status:-unknown} dispatched_events=${dispatched_events:-0} dispatch_steps=${steps:-0}"
    if [[ "$status" != "queued" && "${dispatched_events:-0}" =~ ^[0-9]+$ && "${steps:-0}" =~ ^[0-9]+$ ]] && (( dispatched_events >= 1 && steps >= 1 )); then
      return 0
    fi
    if [[ "$status" == "failed" || "$status" == "cancelled" ]]; then
      fail "execution ${EXECUTION_ID} reached ${status} before F1 handoff evidence was observed"
    fi
    if (( SECONDS >= deadline )); then
      fail "timeout waiting for scheduler dispatch/runtime handoff evidence for ${EXECUTION_ID}"
    fi
    sleep "$POLL_SECONDS"
  done
}

verify_dispatch_durable() {
  log "checking durable dispatch row uses Postgres as source of truth"
  local row
  row="$(sql_value "SELECT status || '|' || queue_job_id || '|' || trace_id || '|' || run_id FROM executions WHERE tenant_id='${TENANT_ID}' AND id='${EXECUTION_ID}'")"
  IFS='|' read -r status queue_job_id trace_id run_id <<<"$row"
  [[ -n "$status" ]] || fail "execution ${EXECUTION_ID} missing from PostgreSQL"
  [[ "$queue_job_id" == "$EXECUTION_ID" ]] || fail "expected queue_job_id=${EXECUTION_ID}, got ${queue_job_id:-empty}"
  [[ "$trace_id" == "$TRACE_ID" ]] || fail "execution trace_id mismatch: ${trace_id} != ${TRACE_ID}"
  [[ -n "$run_id" ]] || fail "execution run_id must be durable"
  wait_job_present "$EXECUTION_ID"
  wait_dispatch_handoff
}

verify_outbox_publication() {
  log "checking outbox publisher marks durable events and publishes to Redis stream"
  wait_sql_count "published ExecutionQueued/ExecutionDispatched outbox rows for ${EXECUTION_ID}" "SELECT count(*) FROM outbox_events WHERE tenant_id='${TENANT_ID}' AND aggregate_id='${EXECUTION_ID}' AND event_type IN ('ExecutionQueued','ExecutionDispatched') AND published_at IS NOT NULL AND dead_lettered_at IS NULL" 2
  queue_assert stream 1
}

seed_reclaim_candidate() {
  RECLAIM_EXECUTION_ID="$(make_uuid)"
  log "seeding expired running execution for controlled reclaim (${RECLAIM_EXECUTION_ID})"
  psql_exec --set=tenant_id="$TENANT_ID" --set=agent_id="$AGENT_ID" --set=agent_version_id="$AGENT_VERSION_ID" --set=execution_id="$RECLAIM_EXECUTION_ID" --set=user_id="$USER_ID" <<'SQL'
INSERT INTO executions (
  id, tenant_id, agent_id, agent_version_id, state, status, version, input_json, task,
  context_snapshot_json, budget_snapshot_json, governance, created_by, queue_job_id,
  trace_id, run_id, attempt, attempt_count, reclaim_count, lease_owner, lease_token, worker_id,
  lease_expires_at, started_at, updated_at
) VALUES (
  :'execution_id', :'tenant_id', :'agent_id', :'agent_version_id', 'running', 'running', 1,
  '{"prompt":"recover me"}'::jsonb, '{"prompt":"recover me"}'::jsonb,
  '{"agentId":"smoke","agentVersion":1,"workspaceId":"","instructions":"reclaim smoke","modelPolicy":{"primaryModel":"fake/f1-test","allowedModels":["fake/f1-test"],"registeredModels":["fake/f1-test"]},"toolPolicy":{"allow":["builtin.echo"],"deny":[]},"budgetPolicy":{"maxUsdPerRun":"0.01"},"governance":{},"hierarchySnapshot":{"chain":[]},"schemaVersion":2,"resolvedAt":"smoke"}'::jsonb,
  '{"maxUsdPerRun":"0.01"}'::jsonb, '{}'::jsonb, :'user_id', :'execution_id',
  'trace-' || :'execution_id', 'run-' || :'execution_id', 0, 0, 0,
  'dead-worker', 'dead-token-' || :'execution_id', 'dead-worker', NOW() - interval '5 minutes', NOW() - interval '10 minutes', NOW() - interval '5 minutes'
);
SQL
}

wait_reclaim_repair() {
  local deadline=$((SECONDS + SMOKE_TIMEOUT_SECONDS))
  log "waiting for reclaimer repair and scheduler reclaim handoff for ${RECLAIM_EXECUTION_ID}"
  while true; do
    local row status reclaim_count reclaim_events reclaim_steps
    row="$(sql_value "SELECT status || '|' || reclaim_count FROM executions WHERE tenant_id='${TENANT_ID}' AND id='${RECLAIM_EXECUTION_ID}'" || true)"
    status="${row%%|*}"
    reclaim_count="${row##*|}"
    reclaim_events="$(sql_value "SELECT count(*) FROM outbox_events WHERE tenant_id='${TENANT_ID}' AND aggregate_id='${RECLAIM_EXECUTION_ID}' AND event_type='ExecutionDispatched' AND payload_json->>'mode'='reclaim'" | tr -d '[:space:]')"
    reclaim_steps="$(sql_value "SELECT count(*) FROM execution_steps WHERE tenant_id='${TENANT_ID}' AND execution_id='${RECLAIM_EXECUTION_ID}' AND state_from='reclaimable' AND state_to='dispatched'" | tr -d '[:space:]')"
    echo "reclaim execution ${RECLAIM_EXECUTION_ID} status=${status:-unknown} reclaim_count=${reclaim_count:-unknown} reclaim_events=${reclaim_events:-0} reclaim_steps=${reclaim_steps:-0}"
    if [[ "${reclaim_count:-0}" =~ ^[0-9]+$ && "${reclaim_events:-0}" =~ ^[0-9]+$ && "${reclaim_steps:-0}" =~ ^[0-9]+$ ]] && (( reclaim_count == 1 && reclaim_events == 1 && reclaim_steps == 1 )); then
      wait_job_present "reclaim:${RECLAIM_EXECUTION_ID}:1"
      wait_sql_count "published reclaim outbox event for ${RECLAIM_EXECUTION_ID}" "SELECT count(*) FROM outbox_events WHERE tenant_id='${TENANT_ID}' AND aggregate_id='${RECLAIM_EXECUTION_ID}' AND event_type='ExecutionDispatched' AND payload_json->>'mode'='reclaim' AND published_at IS NOT NULL AND dead_lettered_at IS NULL" 1
      return 0
    fi
    if [[ "$status" == "failed" || "$status" == "cancelled" ]]; then
      fail "reclaim candidate reached ${status}"
    fi
    if [[ "${reclaim_count:-0}" =~ ^[0-9]+$ ]] && (( reclaim_count > 1 )); then
      fail "reclaimer duplicated observable reclaim effects for ${RECLAIM_EXECUTION_ID} (reclaim_count=${reclaim_count})"
    fi
    if [[ "${reclaim_events:-0}" =~ ^[0-9]+$ ]] && (( reclaim_events > 1 )); then
      fail "scheduler duplicated reclaim dispatch events for ${RECLAIM_EXECUTION_ID} (events=${reclaim_events})"
    fi
    if (( SECONDS >= deadline )); then
      fail "timeout waiting for reclaim repair for ${RECLAIM_EXECUTION_ID}"
    fi
    sleep "$POLL_SECONDS"
  done
}

main() {
  log "F1 queue workers smoke: proving Redis/BullMQ transport plus PostgreSQL durable workers"
  wait_http "API ready" "$API_URL/health/ready"
  wait_http "runtime-worker ready" "$RUNTIME_URL/health/ready"
  wait_http "scheduler-worker live" "$SCHEDULER_URL/health/live"
  wait_http "scheduler-worker ready" "$SCHEDULER_URL/health/ready"
  wait_http "reclaimer-worker ready" "$RECLAIMER_URL/health/ready"
  wait_http "outbox-publisher-worker ready" "$OUTBOX_URL/health/ready"

  log "checking Redis and execution.dispatch queue reachability with no failed jobs baseline"
  queue_assert summary "" 0

  TOKEN="$(TENANT_ID="$TENANT_ID" USER_ID="$USER_ID" JWT_SECRET="$JWT_SECRET" JWT_KID="$JWT_KID" make_jwt)"
  export TOKEN EXECUTION_ID TRACE_ID CORRELATION_ID TENANT_ID USER_ID
  assert_fresh_heartbeats
  assert_ops_status

  seed_agent
  create_execution_via_api
  verify_dispatch_durable
  verify_outbox_publication

  seed_reclaim_candidate
  wait_reclaim_repair

  log "checking execution.dispatch has no failed jobs after dispatch/reclaim smoke"
  queue_assert summary "" 0
  log "F1 queue workers smoke passed: scheduler-worker, reclaimer-worker and outbox-publisher-worker are live; dispatch, handoff, reclaim and outbox are durable/observable."
}

main "$@"
