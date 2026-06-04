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

REPORT_PATH="${F1_CLOSE_REPORT_PATH:-docs/reports/f1-close-report.md}"
REPORT_STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
REPORT_DECISION="NOT_RUN"
REPORT_FAILURE_REASON=""
REPORT_CHECK_NAMES=()
REPORT_CHECK_RESULTS=()
REPORT_CHECK_DETAILS=()
REPORT_URLS=()

append_report_check() {
  REPORT_CHECK_NAMES+=("$1")
  REPORT_CHECK_RESULTS+=("$2")
  REPORT_CHECK_DETAILS+=("$3")
}

report_escape() {
  printf '%s' "$1" | sed 's/|/\\|/g'
}

write_close_report() {
  [[ "$MODE" == "close" ]] || return 0
  local ended_at commit branch environment build_version build_commit build_time build_phase report_dir
  ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  commit="$(git rev-parse HEAD 2>/dev/null || printf unknown)"
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf unknown)"
  environment="node=${NODE_ENV:-unset}; docker=$(docker --version 2>/dev/null || printf unavailable); compose=$(docker compose version 2>/dev/null || printf unavailable)"
  build_version="${BUILD_VERSION:-unset}"
  build_commit="${BUILD_COMMIT:-unset}"
  build_time="${BUILD_TIME:-unset}"
  build_phase="${BUILD_PHASE:-unset}"
  report_dir="$(dirname "$REPORT_PATH")"
  mkdir -p "$report_dir"

  {
    echo "# F1 Close Gate Report"
    echo
    echo "- Started at (UTC): ${REPORT_STARTED_AT}"
    echo "- Finished at (UTC): ${ended_at}"
    echo "- Commit SHA: ${commit}"
    echo "- Branch: ${branch}"
    echo "- Environment: ${environment}"
    echo "- Build phase: ${build_phase}"
    echo "- Build version: ${build_version}"
    echo "- Build commit: ${build_commit}"
    echo "- Build time: ${build_time}"
    echo
    echo "## Verified public URLs"
    if (( ${#REPORT_URLS[@]} == 0 )); then
      echo
      echo "No public URLs were verified before the gate stopped."
    else
      echo
      for url in "${REPORT_URLS[@]}"; do
        echo "- ${url}"
      done
    fi
    echo
    echo "## Check results"
    echo
    echo "| Check | Result | Detail |"
    echo "|---|---|---|"
    if (( ${#REPORT_CHECK_NAMES[@]} == 0 )); then
      echo "| close gate bootstrap | NOT_RUN | no checks recorded |"
    else
      local i
      for i in "${!REPORT_CHECK_NAMES[@]}"; do
        echo "| $(report_escape "${REPORT_CHECK_NAMES[$i]}") | ${REPORT_CHECK_RESULTS[$i]} | $(report_escape "${REPORT_CHECK_DETAILS[$i]}") |"
      done
    fi
    echo
    echo "## Skip policy"
    echo
    echo "Close mode allows no silent skips. Any required check that cannot run is recorded as FAIL and stops the gate."
    echo
    echo "## Final decision"
    echo
    echo "${REPORT_DECISION}"
    if [[ -n "$REPORT_FAILURE_REASON" ]]; then
      echo
      echo "Failure reason: ${REPORT_FAILURE_REASON}"
    fi
  } > "$REPORT_PATH"
}

run_close_check() {
  local name="$1"
  shift
  log "F1 CLOSE: ${name}"
  set +e
  "$@"
  local status=$?
  set -e
  if [[ $status -eq 0 ]]; then
    append_report_check "$name" "PASS" "$*"
    return 0
  fi
  append_report_check "$name" "FAIL" "$* (exit ${status})"
  REPORT_DECISION="FAIL"
  REPORT_FAILURE_REASON="${name} failed with exit ${status}"
  write_close_report
  exit "$status"
}

run_fast_check() {
  local name="$1"
  shift
  log "F1 FAST: ${name}"
  "$@"
}

run_mode_check() {
  if [[ "$MODE" == "close" ]]; then
    run_close_check "$@"
  else
    run_fast_check "$@"
  fi
}

run_common_checks() {
  run_mode_check "workspace build/typecheck gate" pnpm f1:workspace-type-gate
  run_mode_check "workspace lint" pnpm lint
  run_mode_check "API unit tests" pnpm -s --filter @octo/api test -- --runInBand
  run_mode_check "Agent Graph F1 unit/integration contract" pnpm -s --filter @octo/api test -- src/agents/agent-graph.integration.test.ts
  run_mode_check "scheduler build" pnpm --filter @octo/scheduler-worker build
  run_mode_check "runtime-worker unit checks" bash -c 'cd apps/runtime-worker && python -m compileall src && python -m pytest tests/unit/test_llm_provider.py tests/unit/test_tool_registry.py tests/unit/test_tool_executor.py tests/unit/test_tool_policy.py tests/unit/test_reclaim_lineage.py -q'

  run_mode_check "F1 naming guard (no F2 labels in F1 gate scripts)" bash -c 'matches="$(rg -n "F2 close|f2:agent-graph-smoke|f2-agent-graph-smoke" scripts/f1-verify.sh scripts/f1-agent-graph-smoke.sh scripts/f1-smoke.sh || true)"; matches="$(printf "%s\n" "$matches" | rg -v "F1 naming guard" || true)"; test -z "$matches"'

  log "F1 ${MODE^^}: anti-stub gate"
  PATTERNS=("not yet implemented" "F0 stub" "stub response" "Execution engine not yet wired" "hardcoded healthy" "TODO F1" "status unknown" "queues: \[\]" "workers: \[\]" "healthy: true")
  TARGETS=(apps/api/src apps/runtime-worker/src apps/scheduler-worker/src apps/reclaimer-worker/src packages)
  for p in "${PATTERNS[@]}"; do
    if rg -n "$p" "${TARGETS[@]}" -g '!**/*.md' -g '!**/tests/**' -g '!apps/runtime-worker/src/routers/execution.py' -g '!apps/runtime-worker/src/execution/engine.py' ; then
      echo "Anti-stub gate failed on pattern: $p"
      if [[ "$MODE" == "close" ]]; then
        append_report_check "anti-stub gate" "FAIL" "pattern: $p"
        REPORT_DECISION="FAIL"
        REPORT_FAILURE_REASON="anti-stub gate failed on pattern: $p"
        write_close_report
      fi
      exit 1
    fi
  done
  if [[ "$MODE" == "close" ]]; then
    append_report_check "anti-stub gate" "PASS" "stub/placeholder patterns absent from F1 runtime sources"
  fi
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
  command -v docker >/dev/null 2>&1 || { echo "F1 close gate requires docker" >&2; return 1; }
  docker compose version >/dev/null 2>&1 || { echo "F1 close gate requires docker compose" >&2; return 1; }
}

export_close_defaults() {
  export F1_CLOSE_GATE=1
  export NODE_ENV="${NODE_ENV:-test}"
  export POSTGRES_DB="${POSTGRES_DB:-octo}"
  export POSTGRES_USER="${POSTGRES_USER:-octo}"
  export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-octo}"
  export RUNTIME_POSTGRES_USER="${RUNTIME_POSTGRES_USER:-octo_runtime}"
  export RUNTIME_POSTGRES_PASSWORD="${RUNTIME_POSTGRES_PASSWORD:-octo_runtime}"
  export REDIS_PASSWORD="${REDIS_PASSWORD:-octo}"
  export F1_HOST_DATABASE_URL="${F1_HOST_DATABASE_URL:-${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}}}"
  export F1_HOST_RUNTIME_DATABASE_URL="${F1_HOST_RUNTIME_DATABASE_URL:-${RUNTIME_DATABASE_URL:-postgresql://${RUNTIME_POSTGRES_USER}:${RUNTIME_POSTGRES_PASSWORD}@localhost:5432/${POSTGRES_DB}}}"
  export F1_HOST_REDIS_URL="${F1_HOST_REDIS_URL:-${REDIS_URL:-redis://:${REDIS_PASSWORD}@localhost:6379}}"
  export F1_COMPOSE_DATABASE_URL="${F1_COMPOSE_DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}}"
  export F1_COMPOSE_RUNTIME_DATABASE_URL="${F1_COMPOSE_RUNTIME_DATABASE_URL:-postgresql://${RUNTIME_POSTGRES_USER}:${RUNTIME_POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}}"
  export F1_COMPOSE_REDIS_URL="${F1_COMPOSE_REDIS_URL:-redis://:${REDIS_PASSWORD}@redis:6379}"
  export DATABASE_URL="$F1_HOST_DATABASE_URL"
  export RUNTIME_DATABASE_URL="$F1_HOST_RUNTIME_DATABASE_URL"
  export REDIS_URL="$F1_HOST_REDIS_URL"
  export JWT_SECRET="${JWT_SECRET:-dev-secret}"
  export JWT_KID="${JWT_KID:-dev-hs256}"
  export JWT_SIGNING_KEYS="${JWT_SIGNING_KEYS:-[{\"kid\":\"dev-hs256\",\"algorithm\":\"HS256\",\"isActive\":true,\"secret\":\"dev-secret\"}]}"
  export RUNTIME_API_SECRET="${RUNTIME_API_SECRET:-test-runtime-secret-minimum-32-chars}"
  export LITELLM_MASTER_KEY="${LITELLM_MASTER_KEY:-sk-f1-close-gate-minimum-16}"
  export OPENAI_API_KEY="${OPENAI_API_KEY:-sk-f1-close-gate-fake-openai-key}"
  export OCTO_TEST_LLM_FAKE="${OCTO_TEST_LLM_FAKE:-tool_echo}"
  export OTEL_ENABLED="${OTEL_ENABLED:-false}"
  export BUILD_PHASE="${BUILD_PHASE:-F1}"
  export BUILD_VERSION="${BUILD_VERSION:-0.1.0-f1}"
  export BUILD_COMMIT="${BUILD_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || printf local)}"
  export BUILD_TIME="${BUILD_TIME:-$(date -u +%Y-%m-%dT%H:%M:%SZ)}"
  export SOURCE_COMMIT="${SOURCE_COMMIT:-$BUILD_COMMIT}"
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
  DATABASE_URL="$F1_COMPOSE_DATABASE_URL" RUNTIME_DATABASE_URL="$F1_COMPOSE_RUNTIME_DATABASE_URL" REDIS_URL="$F1_COMPOSE_REDIS_URL" docker compose "$@"
}

compose_down_clean() {
  compose down --remove-orphans --volumes || true
}

run_close_gate() {
  REPORT_DECISION="FAIL"

  cleanup() {
    local status=$?
    if [[ $status -ne 0 ]]; then
      echo "F1 close gate failed; recent compose status/logs follow" >&2
      compose ps >&2 || true
      compose logs --tail=200 api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker postgres redis litellm >&2 || true
      if [[ -z "$REPORT_FAILURE_REASON" ]]; then
        REPORT_FAILURE_REASON="close gate exited with status ${status}"
      fi
      REPORT_DECISION="FAIL"
      write_close_report
    fi
    compose_down_clean
  }
  trap cleanup EXIT

  run_close_check "reset compose stack and volumes for reproducibility" compose_down_clean
  run_close_check "start Postgres/Redis for migrations and integration tests" compose up -d postgres redis
  run_close_check "database migrations via compose migrate service" compose run --rm migrate
  run_close_check "runtime-worker least-privilege database role smoke" bash scripts/f1-runtime-db-role-smoke.sh --strict
  run_close_check "integration tests with mandatory DB/Redis" pnpm testintegration
  run_close_check "tenant isolation gate (API, DB/RLS, queue, scheduler, reclaimer, outbox)" pnpm test:tenant-isolation
  run_close_check "observability gate (executionId/traceId reconstruction)" pnpm test:observability
  run_close_check "compose build for full F1 stack" compose build api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker
  run_close_check "compose up for full F1 stack" compose up -d api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker litellm

  REPORT_URLS+=("${API_ROOT_URL:-http://localhost:3001/}")
  REPORT_URLS+=("${API_URL:-http://localhost:3001/api}/health/live")
  REPORT_URLS+=("${API_URL:-http://localhost:3001/api}/health/ready")
  REPORT_URLS+=("${API_URL:-http://localhost:3001/api}/health/version")
  run_close_check "strict public/API smoke (root, health, metadata, execution, outbox, workers)" env DATABASE_URL="$F1_COMPOSE_DATABASE_URL" REDIS_URL="$F1_COMPOSE_REDIS_URL" bash scripts/f1-smoke.sh --strict
  run_close_check "Agent Graph F1 smoke" env API_URL="http://localhost:3001/api" JWT_SECRET="${JWT_SECRET}" JWT_KID="${JWT_KID}" bash scripts/f1-agent-graph-smoke.sh

  REPORT_DECISION="PASS"
  REPORT_FAILURE_REASON=""
  write_close_report
  log "F1 CLOSE: close gate passed; report written to ${REPORT_PATH}"
  trap - EXIT
  compose_down_clean
}

if [[ "$MODE" == "close" ]]; then
  export_close_defaults
  REPORT_DECISION="FAIL"
  run_close_check "close tooling available (docker and docker compose)" require_close_tooling
fi

run_common_checks
if [[ "$MODE" == "close" ]]; then
  run_close_gate
else
  run_fast_integration_if_available
fi
