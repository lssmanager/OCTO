#!/usr/bin/env bash
set -euo pipefail

compose=(docker compose -f docker-compose.yml -f docker-compose.debug.yml)

log() {
  printf '\n==> %s\n' "$*"
}

generate_hex() {
  local bytes="$1"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
    return
  fi
  python3 - "$bytes" <<'PY'
import secrets
import sys
print(secrets.token_hex(int(sys.argv[1])))
PY
}

export POSTGRES_USER="${POSTGRES_USER:-octo}"
export POSTGRES_DB="${POSTGRES_DB:-octo}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(generate_hex 18)}"
export REDIS_PASSWORD="${REDIS_PASSWORD:-$(generate_hex 18)}"
export RUNTIME_POSTGRES_USER="${RUNTIME_POSTGRES_USER:-octo_runtime}"
export RUNTIME_POSTGRES_PASSWORD="${RUNTIME_POSTGRES_PASSWORD:-$(generate_hex 18)}"
export INTERNAL_SECRET="${INTERNAL_SECRET:-$(generate_hex 32)}"
export JWT_SECRET="${JWT_SECRET:-$(generate_hex 32)}"
export LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-$(generate_hex 24)}"
export OPENAI_API_KEY="${OPENAI_API_KEY:-sk-smoke-$(generate_hex 16)}"
export OCTO_TEST_LLM_FAKE="${OCTO_TEST_LLM_FAKE:-true}"
export SOURCE_COMMIT="${SOURCE_COMMIT:-local}"
export BUILD_VERSION="${BUILD_VERSION:-sha-local}"
export BUILD_COMMIT="${BUILD_COMMIT:-local}"
export BUILD_PHASE="${BUILD_PHASE:-F1}"
export BUILD_TIME="${BUILD_TIME:-local}"
export DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}}"
export RUNTIME_DATABASE_URL="${RUNTIME_DATABASE_URL:-postgresql://${RUNTIME_POSTGRES_USER}:${RUNTIME_POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}}"
export REDIS_URL="${REDIS_URL:-redis://:${REDIS_PASSWORD}@127.0.0.1:6379}"
export API_URL="${API_URL:-http://127.0.0.1:3001/api}"
export RUNTIME_PUBLIC_URL="${RUNTIME_PUBLIC_URL:-http://127.0.0.1:8000}"
export SCHEDULER_PUBLIC_URL="${SCHEDULER_PUBLIC_URL:-http://127.0.0.1:3003}"
export OUTBOX_PUBLIC_URL="${OUTBOX_PUBLIC_URL:-http://127.0.0.1:3010}"
export RECLAIMER_PUBLIC_URL="${RECLAIMER_PUBLIC_URL:-http://127.0.0.1:3011}"

cleanup() {
  log "stopping compose smoke stack"
  "${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

log "resetting compose smoke stack"
"${compose[@]}" down -v --remove-orphans >/dev/null 2>&1 || true

log "starting F1 image smoke stack"
"${compose[@]}" up -d --build \
  postgres \
  redis \
  litellm \
  migrate \
  api \
  runtime-worker \
  scheduler-worker \
  outbox-publisher-worker \
  reclaimer-worker

log "running queue/workers smoke against built images"
bash scripts/f1-queue-workers-smoke.sh

log "F1 image startup smoke passed"
