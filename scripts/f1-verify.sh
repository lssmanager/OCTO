#!/usr/bin/env bash
set -euo pipefail

MODE="fast"
if (( $# > 1 )); then
  echo "Usage: $0 [--fast|--close]" >&2
  exit 64
fi

if [[ "${1:-}" == "--close" ]]; then
  MODE="close"
elif [[ "${1:-}" == "--fast" || "${1:-}" == "" ]]; then
  MODE="fast"
else
  echo "Usage: $0 [--fast|--close]" >&2
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
REQUIRED_CLOSE_CHECKS=(
  "close tooling available (docker and docker compose)"
  "F1 tooling reproducibility gate"
  "workspace build/typecheck gate"
  "workspace lint"
  "API unit tests"
  "Agent Graph F1 unit/integration contract"
  "scheduler build"
  "runtime-worker unit checks"
  "F1 naming guard (Agent Graph F1 is not presented as F2 close evidence)"
  "anti-stub source scan"
  "reset compose stack and volumes for reproducibility"
  "start Postgres/Redis for migrations and integration tests"
  "database migrations via compose migrate service"
  "runtime-worker least-privilege database role smoke"
  "integration tests with mandatory DB/Redis"
  "tenant isolation gate (API, DB/RLS, queue, scheduler, reclaimer, outbox)"
  "observability gate (executionId/traceId reconstruction)"
  "compose build for full F1 stack"
  "Docker reproducibility and hardening gate"
  "compose up for full F1 stack"
  "runtime-worker F1 health, 202 handoff and heartbeat smoke"
  "F1 queue workers durable dispatch, reclaim and outbox smoke"
  "strict public web+API smoke (console, status, health, metadata, execution, outbox, workers)"
  "Agent Graph F1 smoke"
)

append_report_check() {
  REPORT_CHECK_NAMES+=("$1")
  REPORT_CHECK_RESULTS+=("$2")
  REPORT_CHECK_DETAILS+=("$3")
}

report_has_check() {
  local wanted="$1" i
  for i in "${!REPORT_CHECK_NAMES[@]}"; do
    [[ "${REPORT_CHECK_NAMES[$i]}" == "$wanted" ]] && return 0
  done
  return 1
}

mark_unreached_close_checks_failed() {
  [[ "$MODE" == "close" ]] || return 0
  local check
  for check in "${REQUIRED_CLOSE_CHECKS[@]}"; do
    if ! report_has_check "$check"; then
      append_report_check "$check" "FAIL" "not run because the strict close gate stopped earlier; close mode treats not-run required checks as FAIL"
    fi
  done
}

report_escape() {
  printf '%s' "$1" | sed 's/|/\\|/g'
}

write_close_report() {
  [[ "$MODE" == "close" ]] || return 0
  local ended_at commit branch environment build_version build_commit build_time build_phase report_dir gate_command ci_metadata compose_project
  ended_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  commit="$(git rev-parse HEAD 2>/dev/null || printf unknown)"
  branch="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || printf unknown)"
  environment="node=${NODE_ENV:-unset}; pnpm=$(pnpm --version 2>/dev/null || printf unavailable); docker=$(docker --version 2>/dev/null || printf unavailable); compose=$(docker compose version 2>/dev/null || printf unavailable)"
  build_version="${BUILD_VERSION:-unset}"
  build_commit="${BUILD_COMMIT:-unset}"
  build_time="${BUILD_TIME:-unset}"
  build_phase="${BUILD_PHASE:-unset}"
  gate_command="pnpm f1:close-gate"
  ci_metadata="CI=${CI:-false}; GITHUB_RUN_ID=${GITHUB_RUN_ID:-unset}; COOLIFY_RESOURCE_UUID=${COOLIFY_RESOURCE_UUID:-unset}"
  compose_project="${COMPOSE_PROJECT_NAME:-default}"
  report_dir="$(dirname "$REPORT_PATH")"
  mkdir -p "$report_dir"

  {
    echo "# F1 Close Gate Report"
    echo
    echo "- Started at (UTC): ${REPORT_STARTED_AT}"
    echo "- Finished at (UTC): ${ended_at}"
    echo "- Commit SHA: ${commit}"
    echo "- Branch: ${branch}"
    echo "- Gate command: ${gate_command}"
    echo "- Environment: ${environment}"
    echo "- CI/deploy metadata: ${ci_metadata}"
    echo "- Compose project: ${compose_project}"
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
    echo "Close mode allows no silent skips. Any required check that fails, cannot run or is not reached is recorded as FAIL. FAST mode is the only mode that may skip optional local feedback, and every FAST skip is logged with an explicit \`F1 FAST WARNING: SKIP\` label."
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
  mark_unreached_close_checks_failed
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
  run_mode_check "F1 tooling reproducibility gate" pnpm f1:tooling-gate
  run_mode_check "workspace build/typecheck gate" pnpm f1:workspace-type-gate
  run_mode_check "workspace lint" pnpm lint
  run_mode_check "API unit tests" pnpm -s --filter @octo/api test -- --runInBand
  run_mode_check "Agent Graph F1 unit/integration contract" pnpm -s --filter @octo/api test -- src/agents/agent-graph.integration.test.ts
  run_mode_check "scheduler build" pnpm --filter @octo/scheduler-worker build
  run_mode_check "runtime-worker unit checks" bash -c 'cd apps/runtime-worker && python -m compileall src && python -m pytest tests/unit/test_llm_provider.py tests/unit/test_tool_registry.py tests/unit/test_tool_executor.py tests/unit/test_tool_policy.py tests/unit/test_reclaim_lineage.py -q'

  run_mode_check "F1 naming guard (Agent Graph F1 is not presented as F2 close evidence)" bash -c 'matches="$(rg -n "F2 close|f2:agent-graph-smoke|f2-agent-graph-smoke" scripts/f1-verify.sh scripts/f1-agent-graph-smoke.sh scripts/f1-smoke.sh || true)"; matches="$(printf "%s\n" "$matches" | rg -v "F1 naming guard" || true)"; test -z "$matches"'
  run_mode_check "anti-stub source scan" anti_stub_source_scan
}

anti_stub_source_scan() {
  local p
  local patterns=("not yet implemented" "F0 stub" "stub response" "Execution engine not yet wired" "hardcoded healthy" "TODO F1" "status unknown" "queues: \[\]" "workers: \[\]" "healthy: true")
  local targets=(apps/api/src apps/runtime-worker/src apps/scheduler-worker/src apps/reclaimer-worker/src packages)
  for p in "${patterns[@]}"; do
    if rg -n "$p" "${targets[@]}" -g '!**/*.md' -g '!**/tests/**' -g '!apps/runtime-worker/src/routers/execution.py' -g '!apps/runtime-worker/src/execution/engine.py' ; then
      echo "Anti-stub source scan failed on pattern: $p" >&2
      return 1
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
    warn "F1 FAST WARNING: SKIP integration tests because DATABASE_URL and/or REDIS_URL are not set. Use 'pnpm f1:close-gate' for the strict F1 close gate; CLOSE mode never skips this."
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
      warn "F1 FAST WARNING: SKIP optional Docker smoke because docker compose is unavailable. Use close mode on a Docker-capable host to enforce it."
    fi
  else
    warn "F1 FAST WARNING: SKIP Docker smoke because F1_VERIFY_DOCKER=1 was not set. Run 'pnpm f1:close-gate' for the strict gate."
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
  export INTERNAL_SECRET="${INTERNAL_SECRET:-test-internal-secret-minimum-32-chars}"
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
  export WEB_PORT="${WEB_PORT:-3000}"
  export WEB_API_URL="${WEB_API_URL:-http://api:3001/api}"
  export F1_WEB_URL="${F1_WEB_URL:-http://localhost:${WEB_PORT}}"
  export F1_PUBLIC_URL="${F1_PUBLIC_URL:-$F1_WEB_URL}"
  export API_URL="${API_URL:-http://localhost:3001/api}"
  export API_ROOT_URL="${API_ROOT_URL:-http://localhost:3001}"
}

compose() {
  DATABASE_URL="$F1_COMPOSE_DATABASE_URL" RUNTIME_DATABASE_URL="$F1_COMPOSE_RUNTIME_DATABASE_URL" REDIS_URL="$F1_COMPOSE_REDIS_URL" docker compose -f docker-compose.yml -f docker-compose.debug.yml "$@"
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
      compose logs --tail=200 web api runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker postgres redis litellm >&2 || true
      if [[ -z "$REPORT_FAILURE_REASON" ]]; then
        REPORT_FAILURE_REASON="close gate exited with status ${status}"
      fi
      REPORT_DECISION="FAIL"
      mark_unreached_close_checks_failed
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
  run_close_check "compose build for full F1 stack" compose build api web runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker
  run_close_check "Docker reproducibility and hardening gate" pnpm docker:verify-hardening
  run_close_check "compose up for full F1 stack" compose up -d api web runtime-worker scheduler-worker reclaimer-worker outbox-publisher-worker litellm
  run_close_check "runtime-worker F1 health, 202 handoff and heartbeat smoke" env DATABASE_URL="$F1_HOST_DATABASE_URL" API_URL="http://localhost:3001/api" RUNTIME_WORKER_URL="http://localhost:8000" INTERNAL_SECRET="$INTERNAL_SECRET" bash scripts/f1-runtime-handoff-smoke.sh
  run_close_check "F1 queue workers durable dispatch, reclaim and outbox smoke" env DATABASE_URL="$F1_HOST_DATABASE_URL" REDIS_URL="$F1_HOST_REDIS_URL" F1_HOST_DATABASE_URL="$F1_HOST_DATABASE_URL" F1_HOST_REDIS_URL="$F1_HOST_REDIS_URL" API_URL="http://localhost:3001/api" RUNTIME_PUBLIC_URL="http://localhost:8000" SCHEDULER_PUBLIC_URL="http://localhost:3003" OUTBOX_PUBLIC_URL="http://localhost:3010" RECLAIMER_PUBLIC_URL="http://localhost:3011" JWT_SECRET="$JWT_SECRET" JWT_KID="$JWT_KID" bash scripts/f1-queue-workers-smoke.sh

  REPORT_URLS+=("F1 public surface = web+api")
  REPORT_URLS+=("Web URL: ${F1_WEB_URL}/")
  REPORT_URLS+=("Web status URL: ${F1_WEB_URL}/status")
  REPORT_URLS+=("Web health URL: ${F1_WEB_URL}/api/health")
  REPORT_URLS+=("API root URL: ${API_ROOT_URL}/")
  REPORT_URLS+=("API health live URL: ${API_URL}/health/live")
  REPORT_URLS+=("API health ready URL: ${API_URL}/health/ready")
  REPORT_URLS+=("API version URL: ${API_URL}/health/version")
  run_close_check "strict public web+API smoke (console, status, health, metadata, execution, outbox, workers)" env DATABASE_URL="$F1_HOST_DATABASE_URL" REDIS_URL="$F1_HOST_REDIS_URL" F1_HOST_DATABASE_URL="$F1_HOST_DATABASE_URL" F1_HOST_REDIS_URL="$F1_HOST_REDIS_URL" F1_WEB_URL="$F1_WEB_URL" F1_PUBLIC_URL="$F1_PUBLIC_URL" API_URL="$API_URL" API_ROOT_URL="$API_ROOT_URL" bash scripts/f1-smoke.sh --strict
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
