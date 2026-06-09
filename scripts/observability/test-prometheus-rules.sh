#!/usr/bin/env bash
set -euo pipefail
node scripts/observability/check-prometheus-rule-layout.mjs
promtool test rules infra/prometheus/tests/octo-f1.test.yml
