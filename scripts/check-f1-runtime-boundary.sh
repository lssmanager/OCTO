#!/usr/bin/env bash
set -euo pipefail

# Gate for issue #170: F1 runtime-worker is an explicit PostgreSQL direct writer.
# Do not reintroduce comments/docs that describe DATABASE_URL as health-only or
# claim runtime writes go exclusively through the API.

forbidden=$(rg -n -S \
  "NUNCA accede a DB|solo para health check|writes van por la API|never writes to Postgres|NEVER writes to Postgres|no accede directo|no accede directamente|no escribe en DB|no escribe.*PostgreSQL|reads DB only|writes go through Control Plane events|writes go through the Control Plane|writes go exclusively through the API" \
  docker-compose.yml docker-compose.f1.yml docs apps/runtime-worker \
  -g '!**/__pycache__/**' || true)

if [[ -n "$forbidden" ]]; then
  echo "F1 runtime boundary contradiction detected:"
  echo "$forbidden"
  exit 1
fi

required_files=(
  docker-compose.yml
  docker-compose.f1.yml
  apps/runtime-worker/README.md
  docs/architecture/F1-architecture-status.md
  docs/phases/F1.md
  apps/runtime-worker/src/config.py
)

required_terms=(
  "DATABASE_URL"
  "executions"
  "execution_steps"
  "execution_checkpoints"
  "execution_checkpoint_writes"
  "tool_invocations"
  "approvals"
  "outbox_events"
  "worker_heartbeats"
  "F2+"
)

for term in "${required_terms[@]}"; do
  if ! rg -q -S "$term" "${required_files[@]}"; then
    echo "F1 runtime boundary documentation missing required term: $term"
    exit 1
  fi
done

echo "f1-runtime-boundary:check passed"
