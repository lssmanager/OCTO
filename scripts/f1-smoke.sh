#!/usr/bin/env bash
set -euo pipefail

echo "F1 smoke: health endpoints"
curl -fsS http://localhost:3001/api/health/live >/dev/null
curl -fsS http://localhost:3001/api/health/ready >/dev/null
curl -fsS http://localhost:8000/health/live >/dev/null
curl -fsS http://localhost:3003/health/live >/dev/null
curl -fsS http://localhost:3003/health/ready >/dev/null
# reclaimer may expose no HTTP endpoint in some setups; best-effort noop check by container status if docker is used.
