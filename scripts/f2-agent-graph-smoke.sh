#!/usr/bin/env bash
set -euo pipefail

echo "scripts/f2-agent-graph-smoke.sh is a legacy compatibility wrapper; Agent Graph is validated as F1. Use scripts/f1-agent-graph-smoke.sh." >&2
exec bash scripts/f1-agent-graph-smoke.sh "$@"
