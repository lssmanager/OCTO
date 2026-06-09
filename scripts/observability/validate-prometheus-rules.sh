#!/usr/bin/env bash
set -euo pipefail
node scripts/observability/check-prometheus-rule-layout.mjs
promtool check rules infra/prometheus/rules/*.rules.yml
