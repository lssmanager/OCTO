# Docker F1 hardening

Images:
- `docker/api.Dockerfile` (3001, `/api/health/live`)
- `docker/runtime-worker.Dockerfile` (8000, `/health/live`)
- `docker/scheduler-worker.Dockerfile` (3003, `/health/live`)
- `docker/reclaimer-worker.Dockerfile` (reclaimer process)
- `docker/migrate.Dockerfile` (one-shot, `HEALTHCHECK NONE`)

## Local
- `pnpm docker:build:f1`
- `pnpm docker:verify-hardening`
- `trivy image --exit-code 1 --severity HIGH,CRITICAL octo/api:sha-local`
- `syft octo/api:sha-local -o cyclonedx-json > sbom-api.json`

## Tags
- `sha-<git_sha>` immutable
- `pr-<pr_number>` on PR
- `latest` only on main

## Signing
Main branch can sign with Cosign when `COSIGN_KEY` and `COSIGN_PASSWORD` secrets exist.
