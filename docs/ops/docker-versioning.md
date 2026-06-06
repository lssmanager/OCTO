# Docker Versioning, Reproducibility and Hardening (F1)

## Pinning policy

F1 Docker references must be reproducible:

- External runtime images use an exact patch tag and, where supported by the registry, a SHA256 digest.
- Base images in F1 Dockerfiles use patch/minor-specific tags, not mutable aliases such as `latest`, `main-latest`, `edge`, `nightly`, `dev`, `22-alpine`, or `3.12-slim`.
- Local OCTO images use commit-scoped tags (`octo/<service>:sha-${GIT_SHA:-local}`) and are rebuilt by the close gate.

## Current pinned external images

| Service | Image | Selected version | Digest | Reason |
|---|---|---|---|---|
| LiteLLM | `ghcr.io/berriai/litellm:main-v1.61.7@sha256:0f7f39f40bf6ba4cc802b991ce8c4eb2fa41c8a25b821e1d2d5197229cad27fe` | `main-v1.61.7` | `sha256:0f7f39f40bf6ba4cc802b991ce8c4eb2fa41c8a25b821e1d2d5197229cad27fe` | Replaces `main-latest` with an immutable OCI index digest while preserving the upstream LiteLLM proxy image. |
| PostgreSQL | `postgres:16.6-alpine3.21` | `16.6-alpine3.21` | tag-pinned | Exact PostgreSQL patch and Alpine release for F1 state store. |
| Redis | `redis:7.4.2-alpine3.21` | `7.4.2-alpine3.21` | tag-pinned | Exact Redis patch and Alpine release for queues/transient coordination. |

## Controlled update procedure

1. Select the target upstream version from release notes and compatibility tests.
2. Resolve the immutable digest before editing compose. Example for LiteLLM:

   ```bash
   TOKEN=$(curl -fsSL 'https://ghcr.io/token?scope=repository:berriai/litellm:pull&service=ghcr.io' | jq -r .token)
   curl -fsSI \
     -H "Authorization: Bearer ${TOKEN}" \
     -H 'Accept: application/vnd.oci.image.index.v1+json' \
     https://ghcr.io/v2/berriai/litellm/manifests/main-v1.61.7 \
     | awk -F': ' 'tolower($1)=="docker-content-digest" {print $2}'
   ```

3. Update `docker-compose.yml` to `image: <repo>:<version>@sha256:<digest>`.
4. Update this document's current image table.
5. Run:

   ```bash
   docker compose config
   pnpm docker:verify-hardening
   pnpm f1:close-gate
   ```

6. Commit the compose change, report update, and generated `artifacts/f1-hardening-report.md` evidence together.

## Close-gate decision

F1 uses **Option A: hardening is blocking**. `scripts/f1-verify.sh --close` runs `pnpm docker:verify-hardening` after the full F1 image build and before `compose up` for the public smoke checks. Any `FAIL` emitted by the hardening verifier fails `pnpm f1:close-gate`.

Warnings are retained for non-F1 or operationally justified items (for example optional OCI labels in legacy non-canonical Dockerfiles, or read-only hardening on infrastructure/dev-only services), but floating images, root runtime users, missing health checks on long-running F1 services, missing restart policies, and Dockerfile secret material are blocking failures.

## Hardening controls

- Runtime users: F1 images end with a non-root `USER` (`octo`, `reclaimer`, or UID/GID `1001:1001`).
- Health checks: Compose long-running F1 services define health checks; `migrate` is a one-shot job gated by `service_completed_successfully`.
- Restart policies: long-running services use `restart: unless-stopped`; `migrate` intentionally uses `restart: "no"`.
- Blast radius: F1 compose services use explicit `octonet`, named volumes only for PostgreSQL/Redis state, `read_only: true`, `security_opt: ["no-new-privileges:true"]`, `cap_drop: ["ALL"]`, and small `/tmp` tmpfs mounts for application workers.

## Audit command and evidence

Run:

```bash
pnpm docker:verify-hardening
```

The verifier prints `PASS`, `WARN`, and `FAIL` lines, exits non-zero on any `FAIL`, and writes Markdown evidence to `artifacts/f1-hardening-report.md`. The report includes the date, commit, image versions/digests, health-check/restart status, Dockerfile users/stages/OCI-label status, and the complete check log.
