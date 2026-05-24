#!/usr/bin/env bash
set -euo pipefail
docker run --rm -v "$PWD:/work" -w /work prom/prometheus promtool check rules infra/prometheus/rules/octo-f1.yml
