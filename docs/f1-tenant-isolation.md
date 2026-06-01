# F1 tenant isolation suite

Issue #174 closes only when tenant isolation is proven end-to-end, not only by API guards. The mandatory suite is:

```bash
pnpm test:tenant-isolation
```

`pnpm f1:close-gate` runs this command in strict mode after migrations and before the full F1 smoke test. A failure in API scoping, PostgreSQL RLS, queue payload validation, scheduler/reclaimer handoff, runtime-like durable writes, outbox/timeline scoping, or ops/DLQ isolation fails the F1 gate.

## What the suite verifies

- JWT test tokens are signed from `JWT_SECRET` at runtime and include minimal real claims (`sub`, `tenant_id`, roles, scopes, issuer, audience, expiry, JTI).
- Tenant A cannot list, read, mutate, cancel, resume, observe timeline, query DLQ/stale data, reclaim, or dispatch resources owned by Tenant B.
- Tenant B cannot read Tenant A's executions by direct ID.
- `agentId` and `agentVersionId` references are validated against the authenticated tenant before execution creation.
- PostgreSQL RLS is enabled and forced for F1 tenant-scoped tables, including `execution_dlq` and `idempotency_keys`.
- Queue dispatch payloads include `tenantId`; scheduler rejects missing tenant and tenant/agent mismatches.
- Reclaimer refuses mismatched tenant candidates and does not enqueue manipulated reclaim jobs.
- Outbox/timeline readers filter by the `tenant_id` column and do not trust contradictory tenant values inside `payload_json`.

Cross-tenant direct ID access uses `404`/not-found semantics where the API already does so, to avoid revealing that a resource exists in another tenant.

## Local execution

Use disposable Postgres and Redis instances. Do not point this suite at production data.

```bash
export DATABASE_URL='postgresql://octo:octo@localhost:5432/octo'
export REDIS_URL='redis://:octo@localhost:6379'
export JWT_SECRET='local-test-jwt-secret-change-me'
export JWT_SIGNING_KEYS='[{"kid":"tenant-isolation-test","algorithm":"HS256","isActive":true,"secret":"local-test-jwt-secret-change-me"}]'
pnpm db:migrate
pnpm test:tenant-isolation
```

Fixtures use a unique run prefix and are deleted at the end of the run. If a process is interrupted, delete rows whose tenant IDs start with `f1-tenant-isolation-`.

## CI

CI must provide real Postgres and Redis services, then run:

```bash
pnpm test:tenant-isolation
pnpm f1:close-gate
```

The close gate sets safe test defaults for local compose (`JWT_SECRET`, `JWT_SIGNING_KEYS`, `RUNTIME_API_SECRET`, fake LLM keys) when they are absent. CI logs must never print secret values.

## Coolify staging

Run against an ephemeral staging database or a staging database where the test prefix can be safely cleaned. Never run destructive checks against production data.

Set the existing Coolify variables below on the services that consume them. Document only names and safe examples; never commit real values.

| Variable | Purpose | Safe example | Consumers | Required |
| --- | --- | --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection used by API, workers, migrations, and tenant isolation tests. | `postgresql://octo_user:<password>@postgres:5432/octo_staging` | API, scheduler-worker, reclaimer-worker, outbox-publisher-worker, migrations, tests | Yes |
| `REDIS_URL` | Redis/BullMQ connection for dispatch queues, ops, outbox, workers, and tests. | `redis://:<password>@redis:6379` | API, scheduler-worker, reclaimer-worker, outbox-publisher-worker, tests | Yes |
| `JWT_SECRET` | HS256 JWT signing/validation secret used by guards and the test JWT helper. | `change-me-with-32-plus-random-chars` | API, tests | Yes |
| `JWT_SIGNING_KEYS` | Active JWT verification key set for the API guard. | `[{"kid":"tenant-isolation-test","algorithm":"HS256","isActive":true,"secret":"change-me"}]` | API, tests | Yes when JWT auth uses key store |
| `RUNTIME_API_SECRET` | Internal API-runtime authentication secret. | `runtime-secret-32-plus-random-chars` | API, runtime-worker | Yes for runtime calls |
| `INTERNAL_SECRET` | Internal-service authentication alias/separate secret when enabled. | `internal-secret-32-plus-random-chars` | API/admin/internal routes, workers if configured | Optional unless enabled |
| `API_URL` | Internal/external API URL for workers or staging HTTP tests. | `https://octo-api-staging.example.invalid` | workers, staging tests | Optional for local DB-mode suite |
| `RUNTIME_WORKER_URL` | Internal runtime-worker URL for scheduler handoff. | `http://runtime-worker:8000` | scheduler-worker, API if configured | Required for full stack smoke |
| `LITELLM_MASTER_KEY` | LiteLLM gateway key. | `sk-staging-placeholder` | runtime-worker/LiteLLM integration | Required outside fake LLM mode |

Optional tenant-isolation staging controls:

| Variable | Purpose | Safe example | Consumers | Required | When to use |
| --- | --- | --- | --- | --- | --- |
| `E2E_RUN_ISOLATION_TESTS` | Explicit staging switch for operators. | `true` | CI/Coolify job wrapper | Optional | Use to guard manual staging jobs. |
| `E2E_BASE_URL` | HTTP base URL if future variants run against a deployed API instead of direct DB/service integration. | `https://octo-api-staging.example.invalid` | staging tests | Optional | Use for deployed HTTP-only runs. |
| `E2E_TENANT_A_ID`, `E2E_TENANT_B_ID` | Override ephemeral tenant IDs. | `f1-tenant-isolation-a` | staging tests | Optional | Use only if staging needs predeclared tenants. |
| `E2E_TEST_USER_A_ID`, `E2E_TEST_USER_B_ID` | Override ephemeral subject IDs. | `f1-test-user-a` | staging tests | Optional | Use only if staging auth requires known subjects. |

The default and preferred mode creates ephemeral tenants per run and cleans them afterward.
