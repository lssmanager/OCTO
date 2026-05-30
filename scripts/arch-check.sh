#!/usr/bin/env bash
set -euo pipefail

# Forbidden provider SDK imports outside Python LLM adapter boundary
violations=$(rg -n "\bfrom (openai|anthropic|google\.generativeai)\b|\bimport (openai|anthropic|google\.generativeai)\b" apps packages \
  -g '!apps/runtime-worker/app/adapters/llm/**' -g '!**/tests/**' || true)
if [[ -n "$violations" ]]; then
  echo "Forbidden provider SDK imports detected:"; echo "$violations"; exit 1
fi

# No direct Redis XADD outside outbox publisher/tests
violations=$(rg -n "\bxadd\b|\bXADD\b|redis\.xadd" packages apps \
  -g '!packages/events/src/outbox-publisher.ts' -g '!**/tests/**' -g '!**/__tests__/**' || true)
if [[ -n "$violations" ]]; then
  echo "Forbidden direct Redis stream publish usage detected:"; echo "$violations"; exit 1
fi

# No BYPASSRLS in migrations
if rg -n "BYPASSRLS" packages/database/migrations | rg -v "^.+--"; then
  echo "Forbidden BYPASSRLS detected in migrations"; exit 1
fi

# Keep F1 runtime-worker direct-writer boundary explicit and non-contradictory.
bash scripts/check-f1-runtime-boundary.sh

echo "arch:check passed"
