#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! grep -Eq '^\[extend\][[:space:]]*$' .gitleaks.toml || ! grep -Eq '^[[:space:]]*useDefault[[:space:]]*=[[:space:]]*true[[:space:]]*$' .gitleaks.toml; then
  echo "FAIL: .gitleaks.toml must extend the built-in Gitleaks defaults with [extend] useDefault = true." >&2
  exit 1
fi

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

cat > "$tmp_dir/clean-history.txt" <<'EOF_HISTORY'
IMAGE          CREATED BY                                      SIZE      COMMENT
<missing>      ARG BUILD_VERSION=scan-test                     0B
<missing>      ARG BUILD_COMMIT=abcdef123456                   0B
<missing>      ARG BUILD_PHASE=F0                              0B
EOF_HISTORY

scripts/audit-docker-history-secrets.sh --history-file "$tmp_dir/clean-history.txt" >/dev/null

cat > "$tmp_dir/leaky-history.txt" <<'EOF_HISTORY'
IMAGE          CREATED BY                                      SIZE      COMMENT
<missing>      ARG BUILD_VERSION=scan-test                     0B
<missing>      ENV FUTURE_RUNTIME_TOKEN=redacted               0B
<missing>      RUN /bin/sh -c echo APP_PASSWORD=redacted       0B
EOF_HISTORY

if scripts/audit-docker-history-secrets.sh --history-file "$tmp_dir/leaky-history.txt" >/dev/null 2>&1; then
  echo "FAIL: Docker layer audit fixture with TOKEN/PASSWORD indicators was not rejected." >&2
  exit 1
fi

if ! command -v gitleaks >/dev/null 2>&1; then
  echo "SKIP: gitleaks CLI not found; Docker layer and config self-tests passed." >&2
  exit 0
fi

mkdir -p "$tmp_dir/gitleaks-fixture"
printf 'stripe_key = \"%s%s\"\n' 'sk_live_' '1234567890abcdefghijklmnopqrstuv' > "$tmp_dir/gitleaks-fixture/leak.txt"

if gitleaks dir "$tmp_dir/gitleaks-fixture" --config .gitleaks.toml --no-banner --redact >/dev/null 2>&1; then
  echo "FAIL: Gitleaks fixture containing a Stripe live-key-shaped token was not rejected." >&2
  exit 1
fi

echo "PASS: Secret scan gate self-tests rejected controlled Gitleaks and Docker layer leaks."
