#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

assert_mode() {
  local expected="$1"
  shift
  local actual
  actual="$($@)"
  if [[ "$actual" != "$expected" ]]; then
    echo "Expected F1 verify mode '$expected' but got '$actual'" >&2
    exit 1
  fi
}

assert_mode close env F1_VERIFY_MODE=close F1_VERIFY_PRINT_MODE=1 bash scripts/f1-verify.sh
assert_mode fast env F1_VERIFY_MODE=close F1_VERIFY_PRINT_MODE=1 bash scripts/f1-verify.sh --fast
assert_mode close env F1_VERIFY_MODE=fast F1_VERIFY_PRINT_MODE=1 bash scripts/f1-verify.sh --close

if env F1_VERIFY_MODE=invalid F1_VERIFY_PRINT_MODE=1 bash scripts/f1-verify.sh >/tmp/octo-f1-invalid-mode.out 2>/tmp/octo-f1-invalid-mode.err; then
  echo "Invalid F1_VERIFY_MODE unexpectedly passed" >&2
  exit 1
fi
if ! rg -q 'Invalid F1_VERIFY_MODE' /tmp/octo-f1-invalid-mode.err; then
  echo "Invalid F1_VERIFY_MODE failed without an explicit error" >&2
  cat /tmp/octo-f1-invalid-mode.err >&2
  exit 1
fi

# This is the downgrade regression check: when CI asks for close through the
# environment, the script must enter close mode before any fast-only path can run.
assert_mode close env F1_VERIFY_MODE=close F1_VERIFY_PRINT_MODE=1 bash scripts/f1-verify.sh

report_path="/tmp/octo-f1-close-self-test-report.md"
rm -f "$report_path"
if env F1_VERIFY_MODE=close F1_VERIFY_SELF_TEST_FAIL_CLOSE_TOOLING=1 F1_CLOSE_REPORT_PATH="$report_path" bash scripts/f1-verify.sh >/tmp/octo-f1-close-sabotage.out 2>/tmp/octo-f1-close-sabotage.err; then
  echo "Sabotaged close tooling unexpectedly passed" >&2
  exit 1
fi
if ! rg -q 'F1 close gate self-test sabotaged close tooling' /tmp/octo-f1-close-sabotage.err; then
  echo "Close-mode sabotage did not fail at the strict close tooling gate" >&2
  cat /tmp/octo-f1-close-sabotage.err >&2
  exit 1
fi
if ! rg -q 'close mode treats not-run required checks as FAIL' "$report_path"; then
  echo "Close report did not mark unreached required checks as failures" >&2
  cat "$report_path" >&2
  exit 1
fi

echo "F1 verify mode self-test passed"
