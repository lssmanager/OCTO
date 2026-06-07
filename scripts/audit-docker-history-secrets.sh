#!/usr/bin/env bash
set -euo pipefail

# Fail if Docker image history contains names that indicate runtime secrets.
# Keep this pattern intentionally broad: concrete OCTO variables plus future
# variants containing SECRET, TOKEN, or PASSWORD must never enter build layers.
SENSITIVE_DOCKER_HISTORY_PATTERN='(^|[^[:alnum:]_])([[:alnum:]_]*(SECRET|TOKEN|PASSWORD)[[:alnum:]_]*|DATABASE_URL|REDIS_URL|POSTGRES_PASSWORD|JWT_SECRET|API_KEY|LITELLM_MASTER_KEY|RUNTIME_API_SECRET)([^[:alnum:]_]|$)'

usage() {
  cat <<'USAGE'
Usage:
  scripts/audit-docker-history-secrets.sh --image <image>
  scripts/audit-docker-history-secrets.sh --history-file <path>

Fails when Docker history contains runtime secret variable names, including
SECRET/TOKEN/PASSWORD variants and OCTO's concrete secret names.
USAGE
}

if [ "$#" -ne 2 ]; then
  usage >&2
  exit 2
fi

mode="$1"
target="$2"

case "$mode" in
  --image)
    history_output="$(docker history --no-trunc "$target")"
    ;;
  --history-file)
    history_output="$(cat "$target")"
    ;;
  *)
    usage >&2
    exit 2
    ;;
esac

found="$(printf '%s\n' "$history_output" | grep -iE "$SENSITIVE_DOCKER_HISTORY_PATTERN" || true)"

if [ -n "$found" ]; then
  echo "FAIL: Runtime secret indicator found in Docker image layers:"
  echo "$found"
  exit 1
fi

echo "PASS: No secret indicators found in Docker image layers."
