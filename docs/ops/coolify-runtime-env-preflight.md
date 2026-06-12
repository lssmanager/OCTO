# Coolify Runtime Env Preflight

This runbook documents the `config-preflight` one-shot service introduced in the
F1 Docker Compose stack.

## Why it exists

Recent Coolify deploy failures made it all the way to container startup before
showing that critical runtime secrets were missing or desynchronized. The most
visible example was PostgreSQL crash-looping with:

```text
Error: Database is uninitialized and superuser password is not specified.
```

That message means the compose resource reached runtime without a valid
`POSTGRES_PASSWORD` environment variable for the `postgres` service.

## What `config-preflight` validates

Before `postgres`, `redis`, `migrate`, `litellm`, `api`, `web`, or the workers
start, the preflight container validates:

- `POSTGRES_PASSWORD` is present and non-empty
- `REDIS_PASSWORD` is present and non-empty
- `DATABASE_URL` is present, valid, points to `postgres`, targets `${POSTGRES_DB}`, and uses `${POSTGRES_USER}` with the same password as `POSTGRES_PASSWORD`
- `RUNTIME_DATABASE_URL` is present, valid, points to `postgres`, targets `${POSTGRES_DB}`, and uses `${RUNTIME_POSTGRES_USER}` with the same password as `RUNTIME_POSTGRES_PASSWORD`
- `RUNTIME_POSTGRES_USER` differs from `POSTGRES_USER`
- `RUNTIME_POSTGRES_PASSWORD` differs from `POSTGRES_PASSWORD`
- `REDIS_URL` is present, valid, points to `redis`, and uses the same password as `REDIS_PASSWORD`
- `JWT_SECRET`, `LITELLM_MASTER_KEY`, and `INTERNAL_SECRET` are present
- `JWT_SECRET` and `INTERNAL_SECRET` are at least 32 characters
- `JWT_SIGNING_KEYS`, when set in production, is valid JSON, is a non-empty array, and contains exactly one active key
- `OPENAI_API_KEY` is present unless `OCTO_TEST_LLM_FAKE=true`
- `LITELLM_BASE_URL` points to the internal compose hostname `litellm`

## Operational effect

If one of these checks fails, the deployment now stops in `config-preflight`
with a direct configuration error instead of starting partial infrastructure and
forcing the operator to infer the real problem from container crash loops.

## Required Coolify variables

At minimum, the compose resource must define these runtime Environment
Variables before deploy:

- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `RUNTIME_POSTGRES_USER`
- `RUNTIME_POSTGRES_PASSWORD`
- `DATABASE_URL`
- `RUNTIME_DATABASE_URL`
- `REDIS_PASSWORD`
- `REDIS_URL`
- `JWT_SECRET`
- `LITELLM_MASTER_KEY`
- `INTERNAL_SECRET`
- `OPENAI_API_KEY` unless fake LLM mode is intentional

## Example values

```text
POSTGRES_DB=octo
POSTGRES_USER=octo
RUNTIME_POSTGRES_USER=octo_runtime
DATABASE_URL=postgresql://octo:<POSTGRES_PASSWORD>@postgres:5432/octo
RUNTIME_DATABASE_URL=postgresql://octo_runtime:<RUNTIME_POSTGRES_PASSWORD>@postgres:5432/octo
REDIS_URL=redis://:<REDIS_PASSWORD>@redis:6379
LITELLM_BASE_URL=http://litellm:4000
```

## Local validation

You can run the same guard locally before a deploy:

```bash
pnpm compose:validate-env
```

This command uses the same validation script as the compose preflight service.
