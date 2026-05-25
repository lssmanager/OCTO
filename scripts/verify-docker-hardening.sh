#!/usr/bin/env bash
set -euo pipefail
services=(api runtime-worker scheduler-worker migrate)
for s in "${services[@]}"; do
  img="octo/${s}:sha-local"
  docker image inspect "$img" >/dev/null
  user=$(docker inspect --format '{{.Config.User}}' "$img")
  test -n "$user"
  [[ "$user" != "root" && "$user" != "0" ]]
  docker inspect --format '{{json .Config.Labels}}' "$img" | rg 'org.opencontainers.image.title' >/dev/null
  if [[ "$s" != "migrate" ]]; then
    docker inspect --format '{{json .Config.Healthcheck}}' "$img" | rg -v 'null' >/dev/null
  fi
  docker inspect --format '{{range .Config.Env}}{{println .}}{{end}}' "$img" | rg '(_KEY=|_SECRET=|PASSWORD=|TOKEN=)' && exit 1 || true
done
rg -n '/var/run/docker.sock|privileged:\s*true' docker-compose.yml docker-compose.f1.yml && exit 1 || true
rg -n 'read_only:\s*true' docker-compose.f1.yml >/dev/null
rg -n 'no-new-privileges:true' docker-compose.f1.yml >/dev/null
rg -n 'cap_drop:\s*\["ALL"\]' docker-compose.f1.yml >/dev/null
echo 'docker hardening checks passed'
