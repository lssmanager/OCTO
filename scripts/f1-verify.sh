#!/usr/bin/env bash
set -euo pipefail

MODE="${F1_VERIFY_MODE:-fast}"
if [[ "${1:-}" == "--close" ]]; then
  MODE="close"
elif [[ "${1:-}" == "--fast" ]]; then
  MODE="fast"
elif [[ "${1:-}" == "" ]]; then
  :
else
  echo "Usage: $0 [--fast|--close]" >&2
  exit 64
fi

if [[ "$MODE" != "fast" && "$MODE" != "close" ]]; then
  echo "F1 verify mode must be 'fast' or 'close' (got '$MODE')" >&2
  exit 64
fi

log() { printf '\n==> %s\n' "$*"; }
warn() { printf '\n!! %s\n' "$*"; }

run_common_checks() {
  log "F1 ${MODE}: lint"
  pnpm lint

  log "F1 ${MODE}: typecheck"
  pnpm typecheck

  log "F1 ${MODE}: API unit tests"
  pnpm -s --filter @octo/api test -- --runInBand

  log "F1 ${MODE}: scheduler build"
  pnpm --filter @octo/scheduler-worker build

  log "F1 ${MODE}: runtime-worker unit checks"
  pushd apps/runtime-worker >/dev/null
  python -m compileall src
  python -m pytest tests/unit/test_llm_provider.py tests/unit/test_tool_registry.py tests/unit/test_tool_executor.py tests/unit/test_tool_policy.py tests/unit/test_reclaim_lineage.py -q
  popd >/dev/null

  log "F1 ${MODE}: anti-stub gate"
  PATTERNS=("not yet implemented" "F0 stub" "stub response" "Execution engine not yet wired" "hardcoded healthy" "TODO F1" "status unknown" "queues: \[\]" "workers: \[\]" "healthy: true")
  TARGETS=(apps/api/src apps/runtime-worker/src apps/scheduler-worker/src apps/reclaimer-worker/src packages)
  for p in "${PATTERNS[@]}"; do
    if rg -n "$p" "${TARGETS[@]}" -g '!**/*.md' -g '!**/tests/**' -g '!apps/runtime-worker/src/routers/execution.py' -g '!apps/runtime-worker/src/execution/engine.py' ; then
      echo "Anti-stub gate failed on pattern: $p"
      exit 1
    fi
  done
}

run_fast_integration_if_available() {
  if [[ -n "${DATABASE_URL:-}" && -n "${REDIS_URL:-}" ]]; then
    log "F1 fast: integration tests with provided DATABASE_URL/REDIS_URL"
    pnpm testintegration
    pnpm test:tenant-isolation
    pnpm test:observability
  else
    warn "F1 fast: skipping integration tests because DATABASE_URL and/or REDIS_URL are not set. Use 'pnpm f1:close-gate' for the strict F1 close gate; close mode never skips this."
  fi

  if [[ "${F1_VERIFY_DOCKER:-0}" == "1" ]]; then
    if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
      log "F1 fast: optional Docker smoke (F1_VERIFY_DOCKER=1)"
      cleanup() { docker compose down || true; }
      trap cleanup EXIT
      docker compose build
      docker compose up -d
      bash scripts/f1-smoke.sh --strict
      cleanup
      trap - EXIT
    else
      warn "F1 fast: skipping optional Docker smoke because docker compose is unavailable. Use close mode on a Docker-capable host to enforce it."
    fi
  else
    warn "F1 fast: Docker smoke not requested (set F1_VERIFY_DOCKER=1 or run 'pnpm f1:close-gate')."
  fi
}

require_close_tooling() {
  command -v docker >/dev/null 2>&1 || { echo "F1 close gate requires docker" >&2; exit 1; }
  docker compose version >/dev/null 2>&1 || { echo "F1 close gate requires docker compose" >&2; exit 1; }
}

export_close_defaults() {
  export F1_CLOSE_GATE=1
  export NODE_ENV="${NODE_ENV:-test}"
  export POSTGRES_DB="${POSTGRES_DB:-octo}"
  export POSTGRES_USER="${POSTGRES_USER:-octo}"
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-octo}"
  export REDIS_PASSWORD="${REDIS_PASSWORD:-octo}"
  export F1_HOST_DATABASE_URL="${F1_HOST_DATABASE_URL:-${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}}}"
  export F1_HOST_REDIS_URL="${F1_HOST_REDIS_URL:-${REDIS_URL:-redis://:${REDIS_PASSWORD}@localhost:6379}}"
  export F1_COMPOSE_DATABASE_URL="${F1_COMPOSE_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}}"
  export F1_COMPOSE_REDIS_URL="${F1_COMPOSE_REDIS_URL:-redis://:${REDIS_PASSWORD}@redis:6379}"
  export DATABASE_URL="$F1_HOST_DATABASE_URL"
  export REDIS_URL="$F1_HOST_REDIS_URL"
  export JWT_SECRET="${JWT_SECRET:-dev-secret}"
  export JWT_SIGNING_KEYS="${JWT_SIGNING_KEYS:-[{\"kid\":\"dev-hs256\",\"algorithm\":\"HS256\",\"isActive\":true,\"secret\":\"dev-secret\"}]}"
  export RUNTIME_API_SECRET="${RUNTIME_API_SECRET:-test-runtime-secret-minimum-32-chars}"
  export LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-sk-f1-close-gate-minimum-16}"
  export OPENAI_API_KEY="${OPENAI_API_KEY:-sk-f1-close-gate-fake-openai-key}"
  export OCTO_TEST_LLM_FAKE="${OCTO_TEST_LLM_FAKE:-tool_echo}"
  export OTEL_ENABLED="${OTEL_ENABLED:-false}"
  export BUILD_PHASE="${BUILD_PHASE:-F1}"
  export RECLAIM_INTERVAL_MS="${RECLAIM_INTERVAL_MS:-1000}"
  export LEASE_TIMEOUT_MS="${LEASE_TIMEOUT_MS:-1000}"
  export EXECUTION_LEASE_SECONDS="${EXECUTION_LEASE_SECONDS:-5}"
  export OUTBOX_POLL_INTERVAL_MS="${OUTBOX_POLL_INTERVAL_MS:-250}"
  export EXECUTION_DISPATCH_RECONCILER_INTERVAL_MS="${EXECUTION_DISPATCH_RECONCILER_INTERVAL_MS:-1000}"
  export EXECUTION_DISPATCH_RECONCILER_STALE_MS="${EXECUTION_DISPATCH_RECONCILER_STALE_MS:-1000}"
  export OCTO_POSTGRES_VOLUME="${OCTO_POSTGRES_VOLUME:-octo_f1_close_postgres_data}"
  export OCTO_REDIS_VOLUME="${OCTO_REDIS_VOLUME:-octo_f1_close_redis_data}"
}

compose() {
  DATABASE_URL="$F1_COMPOSE_DATABASE_URL" REDIS_URL="$F1_COMPOSE_REDIS_URL" docker compose "$@"
}

compose_down_clean() {
  compose down --remove-orphans --volumes || true
}

run_close_gate() {
  require_close_tooling
  export_close_defaults

  cleanup() {
    local status=$?
    if [[ $status -ne 0 ]]; then
      echo "F1 close gate failed; recent compose status/logs follow" >&2
      compose ps >&2 || true
      compose logs --tail=200 api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker postgres redis litellm >&2 || true
    fi
    compose_down_clean
  }
  trap cleanup EXIT

  log "F1 close: reset compose stack and volumes for reproducibility"
  compose_down_clean

  log "F1 close: start Postgres/Redis for migrations and integration tests"
  compose up -d postgres redis
  compose run --rm migrate

  log "F1 close: integration tests (DATABASE_URL/REDIS_URL are mandatory in close mode)"
  pnpm testintegration

  log "F1 close: tenant isolation gate (API, DB/RLS, queue, scheduler, reclaimer, outbox)"
  pnpm test:tenant-isolation

  log "F1 close: observability gate (executionId/traceId reconstruction)"
  pnpm test:observability

  log "F1 close: build full compose stack"
  compose build api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker

  log "F1 close: start full F1 stack"
  compose up -d api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker litellm

  log "F1 close: strict end-to-end smoke"
  DATABASE_URL="$F1_COMPOSE_DATABASE_URL" REDIS_URL="$F1_COMPOSE_REDIS_URL" bash scripts/f1-smoke.sh --strict

  log "F1 close gate passed"
  trap - EXIT
  compose_down_clean
}

run_common_checks
if [[ "$MODE" == "close" ]]; then
  run_close_gate
else
  run_fast_integration_if_available
fi
