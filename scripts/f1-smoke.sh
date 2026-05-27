#!/usr/bin/env bash
set -euo pipefail

echo "F1 smoke placeholder: verify health endpoints"
curl -fsS http://localhost:3001/api/health/live >/dev/null
curl -fsS http://localhost:8000/health/live >/dev/null
curl -fsS http://localhost:3003/health/live >/dev/null || true
