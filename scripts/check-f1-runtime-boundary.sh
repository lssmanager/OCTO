#!/usr/bin/env bash
set -euo pipefail

# Gate for issue #170: F1 runtime-worker is an explicit PostgreSQL direct writer.
# This wrapper keeps the quick narrative guard and then runs the executable
# contract verifier for docs, migration grants and runtime SQL writes.

forbidden=$(rg -n -S \
  "NUNCA accede a DB|solo para health check|writes van por la API|never writes to Postgres|NEVER writes to Postgres|no accede directo|no accede directamente|no escribe en DB|no escribe.*PostgreSQL|reads DB only|writes go through Control Plane events|writes go through the Control Plane|writes go exclusively through the API" \
  docker-compose.yml docker-compose.f1.yml docs apps/runtime-worker \
  -g '!**/__pycache__/**' || true)

if [[ -n "$forbidden" ]]; then
  echo "F1 runtime boundary contradiction detected:"
  echo "$forbidden"
  exit 1
fi

python3 scripts/check-f1-runtime-contract.py

echo "f1-runtime-boundary:check passed"
