#!/usr/bin/env bash
set -euo pipefail

pnpm lint
pnpm typecheck
pnpm -s --filter @octo/api test -- --runInBand
pnpm --filter @octo/scheduler-worker build

pushd apps/runtime-worker >/dev/null
python -m compileall src
python -m pytest tests/unit/test_llm_provider.py tests/unit/test_tool_registry.py tests/unit/test_tool_executor.py tests/unit/test_tool_policy.py tests/unit/test_reclaim_lineage.py -q
popd >/dev/null

# anti-stub gate
PATTERNS=("not yet implemented" "F0 stub" "stub response" "Execution engine not yet wired" "hardcoded healthy" "TODO F1" "status unknown" "queues: \[\]" "workers: \[\]" "healthy: true")
TARGETS=(apps/api/src apps/runtime-worker/src apps/scheduler-worker/src apps/reclaimer-worker/src packages)
for p in "${PATTERNS[@]}"; do
  if rg -n "$p" "${TARGETS[@]}" -g '!**/*.md' -g '!**/tests/**' -g '!apps/runtime-worker/src/routers/execution.py' -g '!apps/runtime-worker/src/execution/engine.py' ; then
    echo "Anti-stub gate failed on pattern: $p"
    exit 1
  fi
done

if [[ -n "${DATABASE_URL:-}" && -n "${REDIS_URL:-}" ]]; then
  pnpm testintegration
else
  echo "Skipping F1 integration tests: DATABASE_URL/REDIS_URL not set"
fi

if [[ "${F1_VERIFY_DOCKER:-0}" == "1" ]]; then
  if command -v docker >/dev/null 2>&1; then
    cleanup() { docker compose down || true; }
    trap cleanup EXIT
    docker compose build
    docker compose up -d
    bash scripts/f1-smoke.sh
    cleanup
    trap - EXIT
  else
    echo "docker not found; skipping docker gate"
  fi
fi
