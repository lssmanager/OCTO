#!/usr/bin/env bash
set -euo pipefail

WEB_URL="${F1_WEB_URL:-${F1_PUBLIC_URL:-https://agents.socialstudies.cloud}}"
API_URL="${API_URL:-${WEB_URL%/}/api}"

trim_slash() { printf '%s' "${1%/}"; }
WEB_URL="$(trim_slash "$WEB_URL")"
API_URL="$(trim_slash "$API_URL")"

PASS_COUNT=0
FAIL_COUNT=0

log() { printf '\n==> %s\n' "$*"; }
pass() { printf 'PASS: %s\n' "$*"; PASS_COUNT=$((PASS_COUNT + 1)); }
fail() { printf 'FAIL: %s\n' "$*" >&2; FAIL_COUNT=$((FAIL_COUNT + 1)); }

curl_capture() {
  local url="$1" out="$2" headers="$3"
  curl -k -sS -D "$headers" -o "$out" -w '%{http_code}' --max-time "${F1_COOLIFY_SMOKE_TIMEOUT:-20}" "$url" || true
}

expect_http() {
  local name="$1" url="$2" expected="$3" body headers status
  body="$(mktemp)"
  headers="$(mktemp)"
  status="$(curl_capture "$url" "$body" "$headers")"
  printf '%s %s -> HTTP %s\n' "$name" "$url" "${status:-curl-error}"
  if [[ "$status" == "$expected" ]]; then
    pass "$name returned HTTP $expected"
  else
    fail "$name expected HTTP $expected but got ${status:-curl-error}"
    sed -n '1,20p' "$headers" >&2 || true
    sed -n '1,40p' "$body" >&2 || true
  fi
  LAST_BODY="$body"
  LAST_HEADERS="$headers"
}

expect_contains() {
  local name="$1" file="$2" pattern="$3"
  if grep -qi "$pattern" "$file"; then
    pass "$name contains $pattern"
  else
    fail "$name missing $pattern"
    sed -n '1,80p' "$file" >&2 || true
  fi
}

expect_not_contains() {
  local name="$1" file="$2" pattern="$3"
  if grep -qi "$pattern" "$file"; then
    fail "$name unexpectedly contains $pattern"
    sed -n '1,80p' "$file" >&2 || true
  else
    pass "$name does not contain $pattern"
  fi
}

expect_ready_json() {
  local file="$1"
  node - "$file" <<'NODE'
const fs = require('fs');
const body = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const checks = body.checks || {};
const failures = [];
if (body.ready !== true && body.status !== 'ok') failures.push(`ready=${body.ready}, status=${body.status}`);
for (const key of ['postgres', 'redis', 'queue', 'litellm']) {
  if (!checks[key]) failures.push(`${key} missing`);
  else if (checks[key].status !== 'ok') failures.push(`${key}=${checks[key].status}`);
}
if (checks.queue && checks.queue.name !== 'execution.dispatch') failures.push(`queue.name=${checks.queue.name}`);
if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}
NODE
}

log "F1 Coolify public smoke"
printf 'WEB_URL=%s\nAPI_URL=%s\n' "$WEB_URL" "$API_URL"

expect_http 'web root' "$WEB_URL/" '200'
expect_not_contains 'web root' "$LAST_BODY" 'Cannot GET /'
expect_contains 'web root' "$LAST_BODY" 'Agent Graph Console'
expect_contains 'web root' "$LAST_BODY" 'Agent Graph System'

expect_http 'web status' "$WEB_URL/status" '200'
expect_not_contains 'web status' "$LAST_BODY" 'Cannot GET /status'
expect_contains 'web status' "$LAST_BODY" 'Services\|Foundation\|Control Plane'

expect_http 'API live' "$API_URL/health/live" '200'
expect_contains 'API live' "$LAST_BODY" '"status"[[:space:]]*:[[:space:]]*"ok"'

expect_http 'API ready' "$API_URL/health/ready" '200'
if expect_ready_json "$LAST_BODY"; then
  pass 'API ready reports postgres, redis, execution.dispatch and litellm ok'
else
  fail 'API ready JSON is not F1-ready'
  cat "$LAST_BODY" >&2 || true
fi

expect_http 'API version' "$API_URL/health/version" '200'
expect_contains 'API version' "$LAST_BODY" '"phase"[[:space:]]*:[[:space:]]*"F1"'
expect_contains 'API version' "$LAST_BODY" '"version"[[:space:]]*:'
expect_contains 'API version' "$LAST_BODY" '"commit"[[:space:]]*:'

printf '\nF1 Coolify public smoke summary: PASS=%s FAIL=%s\n' "$PASS_COUNT" "$FAIL_COUNT"
if (( FAIL_COUNT > 0 )); then
  exit 1
fi
