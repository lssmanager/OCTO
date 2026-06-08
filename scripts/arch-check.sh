#!/usr/bin/env bash
set -euo pipefail

# TypeScript boundary lint enforces the official OCTO stack DAG and direct provider SDK ban.
pnpm lint:boundaries
node scripts/self-test-boundary-lint.mjs

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

# No BYPASSRLS grants in migrations. NOBYPASSRLS assertions are required for
# the F1 runtime DB role and are intentionally allowed.
if rg -n "\bBYPASSRLS\b" packages/database/migrations \
  | rg -v "NOBYPASSRLS|must not have BYPASSRLS|^.+--"; then
  echo "Forbidden BYPASSRLS grant detected in migrations"; exit 1
fi

# Keep F1 runtime-worker direct-writer boundary explicit and non-contradictory.
bash scripts/check-f1-runtime-boundary.sh

echo "arch:check passed"
