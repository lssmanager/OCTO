#!/usr/bin/env bash
set -euo pipefail

# F1 queue/workers smoke for Docker/Compose/Coolify.
# It proves PostgreSQL-backed durable dispatch plus live scheduler,
# reclaimer and outbox publisher workers; Redis/BullMQ is validated only
# as transport/co-ordination and never as the source of truth.

API_URL="${API_URL:-http://localhost:3001/api}"
RUNTIME_URL="${RUNTIME_PUBLIC_URL:-http://localhost:8000}"
SCHEDULER_URL="${SCHEDULER_PUBLIC_URL:-http://localhost:3003}"
OUTBOX_URL="${OUTBOX_PUBLIC_URL:-http://localhost:3010}"
RECLAIMER_URL="${RECLAIMER_PUBLIC_URL:-http://localhost:3011}"
DATABASE_URL="${DATABASE_URL:-${F1_HOST_DATABASE_URL:-}}"
REDIS_URL="${REDIS_URL:-${F1_HOST_REDIS_URL:-redis://localhost:6379}}"
JWT_SECRET="${JWT_SECRET:-dev-secret}"
JWT_KID="${JWT_KID:-dev-hs256}"
F1_SMOKE_TENANT_ID="${F1_SMOKE_TENANT_ID:-tenant-f1-smoke}"
F1_QUEUE_SMOKE_TIMEOUT_SECONDS="${F1_QUEUE_SMOKE_TIMEOUT_SECONDS:-90}"
F1_QUEUE_SMOKE_POLL_SECONDS="${F1_QUEUE_SMOKE_POLL_SECONDS:-2}"

export API_URL RUNTIME_URL SCHEDULER_URL OUTBOX_URL RECLAIMER_URL DATABASE_URL REDIS_URL JWT_SECRET JWT_KID F1_SMOKE_TENANT_ID

log() { printf '\n==> %s\n' "$*"; }
fail() { echo "F1 queue workers smoke failed: $*" >&2; diagnostics >&2; exit 1; }

derive_api_root_url() {
  local api_url="${1%/}"
  if [[ "$api_url" == */api ]]; then printf '%s' "${api_url%/api}"; else printf '%s' "$api_url"; fi
}

API_ROOT_URL="${API_ROOT_URL:-$(derive_api_root_url "$API_URL")}"; export API_ROOT_URL
F1_WEB_URL="${F1_WEB_URL:-${F1_PUBLIC_URL:-http://localhost:3000}}"; export F1_WEB_URL
F1_PUBLIC_URL="${F1_PUBLIC_URL:-$F1_WEB_URL}"; export F1_PUBLIC_URL

diagnostics() {
  echo "--- queue worker endpoint diagnostics ---"
  for url in \
    "$API_URL/health/ready" \
    "$API_URL/v1/ops/f1/status" \
    "$RUNTIME_URL/health/ready" \
    "$SCHEDULER_URL/health/status" \
    "$OUTBOX_URL/status" \
    "$RECLAIMER_URL/health/status"; do
    echo "# $url"
    curl -fsS "$url" || true
    echo
  done
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    docker compose ps || true
    docker compose logs --tail=120 api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker postgres redis || true
  fi
}

wait_http() {
  local name="$1" url="$2" deadline=$((SECONDS + F1_QUEUE_SMOKE_TIMEOUT_SECONDS))
  log "waiting for ${name}: ${url}"
  until curl -fsS "$url" >/dev/null; do
    if (( SECONDS >= deadline )); then fail "timeout waiting for ${name}"; fi
    sleep "$F1_QUEUE_SMOKE_POLL_SECONDS"
  done
}

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

psql_check() {
  [[ -n "$DATABASE_URL" ]] || fail "DATABASE_URL or F1_HOST_DATABASE_URL is required for host-side durable PostgreSQL checks"
  command -v psql >/dev/null 2>&1 || fail "psql is required for host-side durable PostgreSQL checks"
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -At -c "$1"
}

assert_redis_and_queue() {
  log "checking Redis and BullMQ execution.dispatch from host REDIS_URL"
  node <<'NODE'
const { Queue } = require('bullmq');
const IORedis = require('ioredis');
const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
(async () => {
  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue('execution.dispatch', { connection });
  try {
    const pong = await connection.ping();
    if (pong !== 'PONG') throw new Error(`unexpected redis ping: ${pong}`);
    const [waiting, active, failed] = await Promise.all([
      queue.getWaitingCount(), queue.getActiveCount(), queue.getFailedCount(),
    ]);
    if (failed !== 0) throw new Error(`execution.dispatch has ${failed} failed jobs before smoke`);
    console.log(JSON.stringify({ queue: 'execution.dispatch', waiting, active, failed }));
  } finally {
    await queue.close();
    await connection.quit();
  }
})().catch((err) => { console.error(err.message || err); process.exit(1); });
NODE
}

assert_fresh_heartbeats() {
  log "checking fresh durable worker heartbeats in PostgreSQL"
  local rows
  rows="$(psql_check "SELECT worker_type FROM worker_heartbeats WHERE worker_type IN ('scheduler-worker','reclaimer-worker','outbox-publisher-worker') AND status IN ('ok','degraded') AND last_heartbeat_at > NOW() - interval '30 seconds' ORDER BY worker_type")"
  for worker in outbox-publisher-worker reclaimer-worker scheduler-worker; do
    grep -qx "$worker" <<<"$rows" || fail "missing fresh durable heartbeat for ${worker}"
  done
}

assert_ops_sees_workers() {
  local token status_file
  token="$(make_jwt)"
  status_file="$(mktemp)"
  log "checking API ops F1 status sees queue workers"
  curl -fsS "$API_URL/v1/ops/f1/status" -H "authorization: Bearer $token" -o "$status_file"
  node - "$status_file" <<'NODE'
const fs = require('fs');
const data = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const required = ['scheduler', 'reclaimer', 'outboxPublisher'];
for (const key of required) {
  const worker = data.workers?.[key];
  if (!worker || !['ok', 'degraded'].includes(worker.status) || worker.reason === 'heartbeat_stale') {
    console.error(`worker ${key} is not live in ops status: ${JSON.stringify(worker)}`);
    process.exit(1);
  }
}
if (data.queues?.executionDispatch?.name !== 'execution.dispatch') {
  console.error(`unexpected dispatch queue status: ${JSON.stringify(data.queues?.executionDispatch)}`);
  process.exit(1);
}
NODE
  rm -f "$status_file"
}

wait_http "API ready" "$API_URL/health/ready"
wait_http "runtime ready" "$RUNTIME_URL/health/ready"
wait_http "scheduler ready" "$SCHEDULER_URL/health/ready"
wait_http "outbox publisher ready" "$OUTBOX_URL/health/ready"
wait_http "reclaimer ready" "$RECLAIMER_URL/health/ready"
psql_check 'SELECT 1' >/dev/null
assert_redis_and_queue
assert_fresh_heartbeats
assert_ops_sees_workers

log "running strict durable queue/workers path (dispatch -> scheduler -> runtime handoff, outbox publish, reclaim/retry)"
F1_SMOKE_MODE=strict F1_SMOKE_TIMEOUT_SECONDS="$F1_QUEUE_SMOKE_TIMEOUT_SECONDS" F1_SMOKE_POLL_SECONDS="$F1_QUEUE_SMOKE_POLL_SECONDS" bash scripts/f1-smoke.sh --strict

assert_redis_and_queue
assert_fresh_heartbeats
assert_ops_sees_workers
log "F1 queue workers smoke passed"
