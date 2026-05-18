# ADR-0016 — Secret Hygiene: No Secrets in Docker Image Layers

**Status:** Accepted  
**Date:** 2026-05-18  
**Sprint:** F0→F1 Hardening (H4)

## Context

Docker image layers are immutable and inspectable. Any secret passed as a
`ARG` during build time is permanently embedded in the image history,
build cache, and registry metadata — even if the `ARG` is not referenced
in the final layer.

This violates MITRE ATT&CK T1552.007 (Container API) and SLSA supply-chain
hardening requirements.

## Decision

**Secrets MUST NEVER appear in:**
- `ARG` directives in any `Dockerfile`
- `docker-compose.yml` `environment:` blocks with literal values
- GitHub Actions environment variables in `jobs.*.env`
- Build logs or image inspect output

**Correct pattern — runtime injection only:**

```dockerfile
# FORBIDDEN
ARG DATABASE_URL
ARG REDIS_URL
ENV DATABASE_URL=$DATABASE_URL

# CORRECT — no secrets at build time
ENV NODE_ENV=production
ENV PORT=3000
# Secrets are injected at container start by Coolify / docker run
```

**Coolify configuration:**
- Secrets go in: `Service → Environment Variables → Secret` (encrypted at rest)
- Injected at: container start (not build time)
- Never stored in: image layers, build cache, registry

**GitHub Actions:**
```yaml
# FORBIDDEN
env:
  DATABASE_URL: postgres://...

# CORRECT
env:
  DATABASE_URL: ${{ secrets.DATABASE_URL }}
```

## Audit Checklist

- [ ] `docker history <image> | grep -i 'url\|key\|secret\|password'` returns empty
- [ ] `docker inspect <image> | jq '.[].Config.Env'` contains no secrets
- [ ] `grep -r 'ARG DATABASE_URL\|ARG REDIS_URL' Dockerfile*` returns empty
- [ ] Coolify service uses Secret type for all credentials

## Consequences

- Slightly more complex local dev setup (must export env vars before `docker run`)
- Use `.env.example` (committed) + `.env` (gitignored) for local development
- Container restarts always use fresh injected secrets — rotation is zero-downtime
