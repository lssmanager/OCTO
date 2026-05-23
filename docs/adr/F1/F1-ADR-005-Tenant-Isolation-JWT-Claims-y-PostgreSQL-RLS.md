# ADR-F1-005 — Tenant Isolation, JWT Claims y PostgreSQL RLS

**Status:** Accepted  
**Phase:** F1 — Core Runtime & Real Agent Execution  
**Author:** OCTO Architecture  
**Date:** 2026-05-23  
**Issue:** [#98](https://github.com/lssmanager/OCTO/issues/98)  
**Blocking for:** F1 COMPLETE / F1 STABLE  
**Related implementation work:** `JWTAuthModule`, `TenantScopeGuard`, `RbacGuard`, `TenantAwareDbService`, RLS migrations, Redis tenant namespacing, security audit events, integration tests.

---

## Table of Contents

1. [Context](#1-context)
2. [Decision](#2-decision)
3. [Non-Goals](#3-non-goals)
4. [Security Model](#4-security-model)
5. [JWT Architecture](#5-jwt-architecture)
6. [Tenant Propagation](#6-tenant-propagation)
7. [RBAC and Scopes](#7-rbac-and-scopes)
8. [PostgreSQL RLS](#8-postgresql-rls)
9. [Database Access Contract](#9-database-access-contract)
10. [Redis Namespacing](#10-redis-namespacing)
11. [Execution Ownership Enforcement](#11-execution-ownership-enforcement)
12. [Internal Service Authentication](#12-internal-service-authentication)
13. [Audit and Observability](#13-audit-and-observability)
14. [Migration Strategy](#14-migration-strategy)
15. [Implementation Blueprint](#15-implementation-blueprint)
16. [Cross-Framework Inspiration](#16-cross-framework-inspiration)
17. [Alternatives Rejected](#17-alternatives-rejected)
18. [Consequences](#18-consequences)
19. [Invariants](#19-invariants)
20. [Validation and Test Suite](#20-validation-and-test-suite)
21. [Exit Criteria Integration](#21-exit-criteria-integration)
22. [Related ADRs](#22-related-adrs)
23. [References](#23-references)

---

## 1. Context

OCTO F1 habilita ejecución real de agentes, checkpoints recuperables, tool invocations, eventos de runtime, approvals y observabilidad operativa. Esas capacidades producen y persisten datos sensibles de negocio: prompts, resultados de tools, snapshots de ejecución, trazas, logs, aprobaciones humanas, costos y artefactos derivados.

Por eso F1 necesita un modelo explícito de aislamiento por tenant antes de declarar el runtime como estable. Un bug de query, un worker mal instrumentado o una key de Redis sin prefijo podrían exponer datos cross-tenant de forma silenciosa.

La decisión principal de este ADR es separar dos conceptos que OCTO no debe mezclar:

| Concepto | Pertenece a | Significado |
|---|---|---|
| `tenant_id` | Security / ownership boundary | Frontera real de acceso, aislamiento de datos, auditoría, scopes, rate limits y ownership. |
| `Agency → Department → Workspace → Agent → SubAgent` | `packages/agent-core` | Topología cognitiva y operacional: delegación, autoridad, coordinación, contexto y ejecución. |

La jerarquía cognitiva **no** representa tenants SaaS. Un tenant puede contener una o muchas jerarquías agentic, pero ningún dato de un tenant puede ser visible a otro tenant por API, worker, evento, Redis, logs o tooling operativo.

F0 preparó contratos, boundaries, seguridad interna y hardening, pero dejó JWT/RBAC/RLS como alcance F1+. F1 cierra esa frontera con un modelo zero-trust completo.

---

## 2. Decision

OCTO adopta un modelo de aislamiento multi-layer para F1:

1. **JWT como fuente única de identidad de usuario y tenant.**
   - El `tenant_id` viene exclusivamente del JWT validado.
   - Se rechaza cualquier `tenant_id` proveniente de body, querystring o headers no firmados.

2. **Request context explícito en NestJS.**
   - `JwtAuthGuard` valida firma, expiración, issuer, audience y algoritmo.
   - `TenantScopeGuard` extrae `tenant_id`, `sub`, `roles` y `scopes`.
   - `RbacGuard` verifica scopes mínimos por endpoint.

3. **PostgreSQL Row-Level Security como red constitucional.**
   - Todas las tablas tenant-scoped tienen columna física `tenant_id NOT NULL`.
   - Todas las tablas F1 de negocio tienen RLS habilitado.
   - Toda transacción ejecuta `set_config('app.current_tenant', tenantId, true)` antes de consultar o mutar datos.
   - El usuario de aplicación y los usuarios de workers no tienen `BYPASSRLS`.

4. **Defense-in-depth en queries.**
   - RLS es obligatorio, pero las queries críticas también incluyen `AND tenant_id = $tenantId` para claridad, rendimiento de índices y 404 limpios.

5. **Redis namespacing por tenant.**
   - Toda key de datos de negocio usa prefijo `octo:{tenant_id}:...`.
   - El acceso a Redis se hace mediante wrapper que impide keys no tenant-scoped.

6. **Service authentication separada de user JWT.**
   - Workers internos no reutilizan JWTs de usuario.
   - `runtime-worker` y `scheduler-worker` usan credenciales de servicio de corta duración y scopes mínimos.
   - El tenant operativo se deriva del execution/job context creado por el Control Plane, nunca de input externo no confiable.

7. **Auditoría y observabilidad de seguridad.**
   - Todo intento cross-tenant, fallo de scope, denegación RLS o token inválido genera evento auditable con `tenant_id`, `user_id` o `service_id`, `trace_id`, `execution_id` y outcome.

---

## 3. Non-Goals

Este ADR **no** define:

- SSO enterprise, SCIM, billing, seat management o organizaciones SaaS complejas.
- Política completa de permisos sobre la jerarquía cognitiva (`Agency`, `Department`, `Workspace`, `Agent`, `SubAgent`). Esa capa vive en `agent-core` y policies de ejecución.
- Memory/RAG security completo para F5+.
- Cross-tenant analytics agregados para operadores globales.
- Modelo legal/compliance completo para data residency.
- Encripción por fila o por tenant con claves distintas. Puede agregarse en fases posteriores.

---

## 4. Security Model

### 4.1 Zero-trust request model

Toda request externa debe validar, antes de tocar estado durable:

1. Identidad (`sub`).
2. Firma y algoritmo del token.
3. Expiración (`exp`).
4. Issuer (`iss`).
5. Audience (`aud`).
6. Tenant (`tenant_id`).
7. Roles.
8. Scopes.
9. Ownership del recurso.
10. Policy del endpoint.

### 4.2 Data ownership model

`tenant_id` es columna obligatoria en toda tabla que contenga datos de negocio o runtime F1:

- `agents`
- `agent_versions`
- `executions`
- `execution_steps`
- `execution_checkpoints`
- `execution_checkpoint_writes`
- `tool_invocations`
- `approvals`
- `outbox_events`
- `audit_log`
- `tenant_memberships`

Las tablas puramente globales o de catálogo pueden no tener `tenant_id`, pero deben ser explícitamente clasificadas como `global_catalog`, `system_config` o `public_reference`.

### 4.3 Security posture

OCTO asume que compromise is inevitable. Por tanto:

- Ningún control individual es suficiente.
- RLS protege contra bugs de aplicación.
- Guards protegen antes de llegar a DB.
- Redis namespacing protege contra colisiones y fugas por cache.
- Audit log permite reconstrucción post-incidente.
- Service auth reduce blast radius de workers autónomos.

---

## 5. JWT Architecture

### 5.1 User access token

Access token de usuario:

- Duración: 60 minutos.
- Algoritmo: RS256.
- Header obligatorio: `kid`.
- Claves públicas expuestas en `/.well-known/jwks.json`.
- `tenant_id` obligatorio.
- `jti` obligatorio para revocación, trazabilidad e idempotencia de sesión.

```json
{
  "sub": "user_123",
  "tenant_id": "tenant_abc",
  "roles": ["tenant_admin", "operator"],
  "scopes": ["agents:read", "agents:write", "executions:write", "ops:read"],
  "iss": "octo-api",
  "aud": "octo-web",
  "iat": 1716211200,
  "exp": 1716214800,
  "jti": "jwt_01H..."
}
```

### 5.2 Refresh token

Refresh token:

- Duración: 7 días.
- Se almacena hashed en PostgreSQL.
- Se rota en cada uso.
- La reutilización de un refresh token anterior invalida la sesión completa.
- El refresh token nunca se usa para autorizar endpoints de negocio.

### 5.3 JWT validation requirements

La validación debe rechazar tokens cuando:

- Falta `tenant_id` en tokens de usuario.
- Falta `sub`.
- `aud` no coincide con `octo-web` o audience esperada.
- `iss` no coincide con `octo-api`.
- `alg` no es RS256.
- `kid` no existe en JWKS activo.
- `jti` está revocado.
- `exp` está vencido.
- `roles` o `scopes` contienen valores fuera del schema.

### 5.4 Contract schema

```typescript
// packages/contracts/src/auth/jwt.ts
import { z } from 'zod';

export const OctoRoleSchema = z.enum([
  'tenant_admin',
  'operator',
  'developer',
  'viewer',
  'service_runtime',
  'service_scheduler',
]);

export const OctoScopeSchema = z.enum([
  'agents:read',
  'agents:write',
  'executions:read',
  'executions:write',
  'executions:run',
  'ops:read',
  'ops:write',
  'queue:manage',
  'approvals:read',
  'approvals:write',
]);

export const OctoJwtPayloadSchema = z.object({
  sub: z.string().min(1),
  tenant_id: z.string().min(1),
  roles: z.array(OctoRoleSchema).min(1),
  scopes: z.array(OctoScopeSchema).min(1),
  iss: z.literal('octo-api'),
  aud: z.union([z.literal('octo-web'), z.literal('octo-cli')]),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().min(1),
});

export type OctoJwtPayload = z.infer<typeof OctoJwtPayloadSchema>;
```

### 5.5 Service JWT schema

Workers internos no usan JWTs de usuario. Usan tokens de servicio con audience `octo-internal`.

```typescript
export const ServiceJwtPayloadSchema = z.object({
  sub: z.string().min(1), // e.g. service:runtime-worker
  roles: z.array(z.enum(['service_runtime', 'service_scheduler'])).min(1),
  scopes: z.array(OctoScopeSchema).min(1),
  iss: z.literal('octo-api'),
  aud: z.literal('octo-internal'),
  iat: z.number().int(),
  exp: z.number().int(),
  jti: z.string().min(1),
});

export type ServiceJwtPayload = z.infer<typeof ServiceJwtPayloadSchema>;
```

Service tokens normalmente **no** llevan `tenant_id`, porque un worker puede consumir jobs de varios tenants. El `tenant_id` operativo se deriva del job/execution creado por el Control Plane y se aplica antes de cada transacción mediante `SET LOCAL` / `set_config`.

---

## 6. Tenant Propagation

### 6.1 External request flow

```text
Client
  -> HTTPS request with Bearer JWT
  -> JwtAuthGuard validates signature + expiry + issuer + audience + kid
  -> TenantScopeGuard extracts tenant_id from validated payload
  -> RbacGuard validates endpoint scopes
  -> Request context gets tenantId, userId, roles, scopes
  -> TenantAwareDbService opens transaction
  -> SELECT set_config('app.current_tenant', tenantId, true)
  -> PostgreSQL RLS filters SELECT/INSERT/UPDATE/DELETE
  -> Domain event includes tenant_id
  -> OTel/log/audit fields include tenant_id
```

### 6.2 Worker execution flow

```text
Control Plane creates execution
  -> execution row includes tenant_id from JWT
  -> queue payload includes execution_id + tenant_id + trace_id

scheduler-worker / runtime-worker
  -> authenticates with service token
  -> validates job payload shape
  -> opens transaction for payload.tenant_id
  -> SELECT set_config('app.current_tenant', tenantId, true)
  -> loads execution through RLS
  -> validates execution.tenant_id == payload.tenant_id
  -> processes step
  -> persists checkpoint/event/tool invocation with same tenant_id
```

### 6.3 Rules

- `tenant_id` from request body is ignored or rejected.
- `tenant_id` from queue payload is trusted only when the payload was produced by the Control Plane and validated against the execution row.
- External callbacks must not provide authoritative `tenant_id`; they must resolve a stored correlation record first.
- Every event envelope includes `tenant_id`.
- Every OTel span includes `tenant_id` when the operation is tenant-scoped.

---

## 7. RBAC and Scopes

### 7.1 Roles

| Role | Permissions |
|---|---|
| `tenant_admin` | CRUD agents, start/cancel/replay executions, view tenant ops dashboard, approve restricted tools, manage tenant membership. |
| `operator` | Start/cancel executions, read timelines, resolve approvals allowed by policy, inspect DLQ for own tenant. |
| `developer` | Read agents, read executions, inspect logs for own tenant, no destructive operations. |
| `viewer` | Read-only access. |
| `service_runtime` | Internal only. Executes runtime steps. No UI login. |
| `service_scheduler` | Internal only. Queue, dispatch, reclaim and reconciliation operations. No UI login. |

### 7.2 Endpoint-level scopes

| Endpoint group | Required scope |
|---|---|
| `GET /v1/agents/*` | `agents:read` |
| `POST/PATCH /v1/agents/*` | `agents:write` |
| `GET /v1/executions/*` | `executions:read` |
| `POST /v1/executions` | `executions:write` |
| Runtime worker internal execute | `executions:run` |
| Queue/reclaim operations | `queue:manage` |
| Ops dashboards | `ops:read` |
| DLQ requeue / manual reclaim | `ops:write` |
| Approval read | `approvals:read` |
| Approval resolve | `approvals:write` |

### 7.3 Guard contract

```typescript
@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard)
@RequireScopes('executions:write')
@Post('/v1/executions')
async createExecution(@Req() req: OctoRequest, @Body() body: CreateExecutionDto) {
  // req.tenantId is authoritative.
  // body.tenant_id is invalid if present.
}
```

---

## 8. PostgreSQL RLS

### 8.1 RLS principle

RLS is the final database-level guard. It must not be the only guard, but it must be impossible to bypass during normal API and worker operation.

PostgreSQL evaluates policy expressions per row for normal SELECT/INSERT/UPDATE/DELETE access. If RLS is enabled and no applicable policy exists, the default behavior is deny. Roles with `BYPASSRLS` bypass RLS, so OCTO application roles must never have that attribute.

### 8.2 Required session variable

OCTO uses a transaction-local session setting:

```sql
SELECT set_config('app.current_tenant', $1, true);
```

Using `set_config(..., true)` is preferred over string-interpolated `SET LOCAL` because it is parameterizable from drivers and scoped to the current transaction.

### 8.3 Universal tenant predicate

Policies use:

```sql
tenant_id = NULLIF(current_setting('app.current_tenant', true), '')
```

If `app.current_tenant` is missing, the expression evaluates false or null and rows are not visible.

### 8.4 Migration SQL

```sql
-- migrations/0005_f1_tenant_isolation_rls.sql

-- 1. Enable RLS on all F1 tenant-scoped business tables.
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_checkpoint_writes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tool_invocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;

-- 2. Force RLS for table owners where applicable.
ALTER TABLE agents FORCE ROW LEVEL SECURITY;
ALTER TABLE agent_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE executions FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_steps FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_checkpoints FORCE ROW LEVEL SECURITY;
ALTER TABLE execution_checkpoint_writes FORCE ROW LEVEL SECURITY;
ALTER TABLE tool_invocations FORCE ROW LEVEL SECURITY;
ALTER TABLE approvals FORCE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_log FORCE ROW LEVEL SECURITY;

-- 3. Tenant isolation policies.
CREATE POLICY tenant_isolation_agents
  ON agents
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_agent_versions
  ON agent_versions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_executions
  ON executions
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_execution_steps
  ON execution_steps
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_checkpoints
  ON execution_checkpoints
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_checkpoint_writes
  ON execution_checkpoint_writes
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_tool_invocations
  ON tool_invocations
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_approvals
  ON approvals
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_outbox_events
  ON outbox_events
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

CREATE POLICY tenant_isolation_audit_log
  ON audit_log
  USING (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''))
  WITH CHECK (tenant_id = NULLIF(current_setting('app.current_tenant', true), ''));

-- 4. Required indexes. RLS adds tenant predicates; indexes are mandatory.
CREATE INDEX IF NOT EXISTS idx_agents_tenant_id
  ON agents (tenant_id);

CREATE INDEX IF NOT EXISTS idx_agent_versions_tenant_agent_version
  ON agent_versions (tenant_id, agent_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_executions_tenant_state_created
  ON executions (tenant_id, state, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_execution_steps_tenant_execution_step
  ON execution_steps (tenant_id, execution_id, step_index);

CREATE INDEX IF NOT EXISTS idx_checkpoints_tenant_execution_step
  ON execution_checkpoints (tenant_id, execution_id, step_index);

CREATE INDEX IF NOT EXISTS idx_checkpoint_writes_tenant_checkpoint
  ON execution_checkpoint_writes (tenant_id, checkpoint_id, write_index);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_tenant_execution
  ON tool_invocations (tenant_id, execution_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_tool_invocations_tenant_idem
  ON tool_invocations (tenant_id, idempotency_key);

CREATE INDEX IF NOT EXISTS idx_approvals_tenant_execution_status
  ON approvals (tenant_id, execution_id, status);

CREATE INDEX IF NOT EXISTS idx_outbox_tenant_unpublished
  ON outbox_events (tenant_id, created_at)
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_audit_log_tenant_created
  ON audit_log (tenant_id, created_at DESC);

-- 5. Startup/migration invariant: app user must not bypass RLS.
DO $$
DECLARE
  bypass_rls BOOLEAN;
BEGIN
  SELECT rolbypassrls INTO bypass_rls
  FROM pg_roles
  WHERE rolname = 'octo_app_user';

  IF bypass_rls THEN
    RAISE EXCEPTION 'SECURITY INVARIANT VIOLATED: octo_app_user has BYPASSRLS';
  END IF;
END;
$$;
```

### 8.5 Cross-tenant audit exception

Security operators may need cross-tenant audit visibility. This must **not** be granted to the normal application role.

Allowed pattern:

- Separate DB role: `octo_security_auditor`.
- Separate service endpoint protected by `ops:security_audit`.
- Read-only access.
- Every query emits audit event.
- No write, replay, mutation or execution authority.

Rejected pattern:

- Giving `octo_app_user` `BYPASSRLS`.
- Using a global superuser connection for normal API or worker paths.

---

## 9. Database Access Contract

### 9.1 Tenant-aware transaction wrapper

All application repositories must use a transaction wrapper that sets tenant context before the first business query.

```typescript
// apps/api/src/database/tenant-aware-db.service.ts
import { Inject, Injectable, Scope } from '@nestjs/common';
import { REQUEST } from '@nestjs/core';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';
import type { OctoRequest } from '../auth/types';

@Injectable({ scope: Scope.REQUEST })
export class TenantAwareDbService {
  private readonly db: ReturnType<typeof drizzle>;

  constructor(
    @Inject('PG_POOL') private readonly pool: Pool,
    @Inject(REQUEST) private readonly request: OctoRequest,
  ) {
    this.db = drizzle(this.pool, { schema });
  }

  async withTenantTx<T>(fn: (tx: typeof this.db) => Promise<T>): Promise<T> {
    const tenantId = this.request.tenantId;
    if (!tenantId) {
      throw new Error('TenantAwareDbService: missing tenantId in request context');
    }

    return this.db.transaction(async (tx) => {
      await tx.execute('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        tenantId,
      ]);
      return fn(tx);
    });
  }

  async withExplicitTenantTx<T>(
    tenantId: string,
    fn: (tx: typeof this.db) => Promise<T>,
  ): Promise<T> {
    if (!tenantId || tenantId.includes(':') || tenantId.includes("'")) {
      throw new Error(`Invalid tenantId: ${tenantId}`);
    }

    return this.db.transaction(async (tx) => {
      await tx.execute('SELECT set_config($1, $2, true)', [
        'app.current_tenant',
        tenantId,
      ]);
      return fn(tx);
    });
  }
}
```

> Implementation note: adapt the parameter syntax to the final Drizzle/pg driver helper. The invariant is not the exact helper signature; the invariant is that tenant context is set transaction-locally before business SQL and without string interpolation.

### 9.2 Repository rule

Forbidden:

```typescript
await db.select().from(executions);
```

Required:

```typescript
await tenantDb.withTenantTx(async (tx) => {
  return tx
    .select()
    .from(executions)
    .where(and(
      eq(executions.tenantId, request.tenantId),
      eq(executions.id, executionId),
    ));
});
```

### 9.3 Worker access rule

Workers must not open raw DB transactions without explicit tenant context.

```python
async with tenant_transaction(conn, tenant_id):
    row = await conn.execute(
        "SELECT * FROM executions WHERE id = :execution_id AND tenant_id = :tenant_id",
        {"execution_id": execution_id, "tenant_id": tenant_id},
    )
```

---

## 10. Redis Namespacing

### 10.1 Key format

All tenant-scoped Redis keys must use:

```text
octo:{tenant_id}:{category}:{identifier...}
```

Examples:

```text
# Rate limits
octo:{tenant_id}:ratelimit:{model}:{window}

# Execution lease heartbeat
octo:{tenant_id}:lease:{execution_id}

# Idempotency keys
octo:{tenant_id}:idem:{key_hash}

# Policy resolution cache
octo:{tenant_id}:policy:{agent_id}

# Runtime heartbeat
octo:{tenant_id}:runtime-heartbeat:{execution_id}:{worker_id}
```

### 10.2 TenantRedisService

```typescript
@Injectable()
export class TenantRedisService {
  constructor(private readonly redis: Redis) {}

  private key(tenantId: string, ...parts: string[]): string {
    if (!tenantId || tenantId.includes(':')) {
      throw new Error(`Invalid tenantId for Redis key: ${tenantId}`);
    }
    return `octo:${tenantId}:${parts.join(':')}`;
  }

  rateLimitKey(tenantId: string, model: string, window: string): string {
    return this.key(tenantId, 'ratelimit', model, window);
  }

  leaseKey(tenantId: string, executionId: string): string {
    return this.key(tenantId, 'lease', executionId);
  }

  idempotencyKey(tenantId: string, keyHash: string): string {
    return this.key(tenantId, 'idem', keyHash);
  }

  policyKey(tenantId: string, agentId: string): string {
    return this.key(tenantId, 'policy', agentId);
  }
}
```

### 10.3 Redis invariants

- No business key may omit tenant prefix.
- Queue names may be global, but job payloads must include `tenant_id` and `trace_id`.
- Redis is never source of truth for tenant ownership.
- Lost Redis cache must be recoverable from PostgreSQL.

---

## 11. Execution Ownership Enforcement

### 11.1 404, not 403

When a request references a resource from another tenant, API must return `404 Not Found`, not `403 Forbidden`.

Rationale: `403` would confirm that the resource exists but belongs to someone else. `404` avoids tenant enumeration.

### 11.2 Ownership service

```typescript
@Injectable()
export class ExecutionOwnershipService {
  constructor(private readonly db: TenantAwareDbService) {}

  async validateExecutionOwnership(
    executionId: string,
    tenantId: string,
  ): Promise<void> {
    const rows = await this.db.withTenantTx(async (tx) => {
      return tx
        .select({ id: executions.id })
        .from(executions)
        .where(and(
          eq(executions.id, executionId),
          eq(executions.tenantId, tenantId),
        ))
        .limit(1);
    });

    if (!rows.length) {
      throw new NotFoundException(`Execution ${executionId} not found`);
    }
  }
}
```

### 11.3 Audit on suspicious access

If the system can safely detect an access attempt to a cross-tenant resource without bypassing RLS, it should emit:

```json
{
  "event_type": "cross_tenant_access_attempt",
  "tenant_id": "tenant_a",
  "user_id": "user_123",
  "resource_type": "execution",
  "resource_id_hash": "sha256:...",
  "trace_id": "trace_...",
  "outcome": "failure"
}
```

Do not run privileged lookups in the hot path solely to detect this. Detection can happen in delayed security analytics using audit-safe controls.

---

## 12. Internal Service Authentication

### 12.1 Service identity model

Internal workers authenticate as services:

| Service | Role | Scopes |
|---|---|---|
| `runtime-worker` | `service_runtime` | `executions:run`, `executions:read`, `approvals:read` |
| `scheduler-worker` | `service_scheduler` | `queue:manage`, `executions:read`, `ops:write` |
| `outbox-publisher` | `service_scheduler` | `ops:write`, `queue:manage` |

### 12.2 Client credentials

For service-to-service auth, OCTO uses OAuth 2.0 client credentials or equivalent internal token issuance:

```text
runtime-worker
  -> authenticates to token endpoint with client credentials
  -> receives short-lived service token
  -> calls internal Control Plane endpoints with octo-internal audience
```

Production preference order:

1. Managed identity / workload identity / federated identity credential.
2. Certificate-based client authentication.
3. Docker secret-injected client secret.
4. Environment variable secret only for local development.

### 12.3 Tenant context in workers

Service token authenticates the worker; it does not define the business tenant.

The tenant is resolved from:

- queue payload generated by Control Plane,
- execution row created by API,
- persisted correlation record for async callbacks,
- tenant iteration in scheduler reconciliation.

Scheduler-wide operations that need to scan all tenants must iterate active tenants and run tenant-scoped transactions one tenant at a time. They must not use a superuser bypass path.

---

## 13. Audit and Observability

### 13.1 Security events

Security-relevant events:

```typescript
export const SecurityEventTypeSchema = z.enum([
  'jwt_generated',
  'jwt_refreshed',
  'jwt_expired',
  'token_revoked',
  'jwks_key_rotated',
  'forbidden_scope',
  'tenant_context_missing',
  'rls_policy_denied',
  'cross_tenant_access_attempt',
  'service_token_issued',
  'service_token_refresh_failed',
  'redis_key_namespace_violation',
]);
```

### 13.2 Audit event shape

```typescript
export const SecurityAuditEventSchema = z.object({
  event_type: SecurityEventTypeSchema,
  tenant_id: z.string().nullable(),
  user_id: z.string().nullable(),
  service_id: z.string().nullable(),
  execution_id: z.string().nullable(),
  agent_id: z.string().nullable(),
  trace_id: z.string(),
  outcome: z.enum(['success', 'failure']),
  detail: z.record(z.unknown()).optional(),
  occurred_at: z.string().datetime(),
});
```

### 13.3 Required telemetry attributes

Every tenant-scoped API request, worker step, LLM call, tool invocation and checkpoint commit must include:

- `tenant_id`
- `trace_id`
- `execution_id` when available
- `agent_id` when available
- `user_id` or `service_id`
- `auth_subject`
- `scope_check_result`
- `rls_context_set=true|false`

### 13.4 Alerts

Critical alerts:

| Signal | Severity | Action |
|---|---|---|
| `cross_tenant_access_attempt > 0` | Critical | Security review, possible abuse or bug. |
| `tenant_context_missing > 0` | Critical | Disable affected endpoint/worker until fixed. |
| `rls_policy_denied > threshold` | High | Investigate wrong tenant propagation or probing. |
| Redis namespace violation | Critical | Stop deployment; fix wrapper bypass. |
| App DB role has `BYPASSRLS` | Critical | Startup must fail. |
| Unknown JWT `kid` spike | High | Possible stale clients or token attack. |

---

## 14. Migration Strategy

### 14.1 F0 to F1 tenant_id backfill

If F0 tables exist without `tenant_id`, migration must be additive and staged:

1. Add nullable `tenant_id` column.
2. Backfill using safe mapping:
   - `executions.tenant_id` from creating user/session or default dev tenant.
   - `execution_steps.tenant_id` from parent `executions`.
   - `execution_checkpoints.tenant_id` from parent `executions`.
   - `tool_invocations.tenant_id` from parent `executions`.
3. Validate no nulls.
4. Add `NOT NULL`.
5. Add indexes.
6. Enable RLS.
7. Force RLS.
8. Remove temporary defaults.
9. Run integration tests against two tenants.

### 14.2 Backfill SQL sketch

```sql
ALTER TABLE executions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE execution_steps ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE execution_checkpoints ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE execution_checkpoint_writes ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE tool_invocations ADD COLUMN IF NOT EXISTS tenant_id TEXT;

UPDATE execution_steps s
SET tenant_id = e.tenant_id
FROM executions e
WHERE s.execution_id = e.id
  AND s.tenant_id IS NULL;

UPDATE execution_checkpoints c
SET tenant_id = e.tenant_id
FROM executions e
WHERE c.execution_id = e.id
  AND c.tenant_id IS NULL;

UPDATE execution_checkpoint_writes w
SET tenant_id = c.tenant_id
FROM execution_checkpoints c
WHERE w.checkpoint_id = c.id
  AND w.tenant_id IS NULL;

UPDATE tool_invocations t
SET tenant_id = e.tenant_id
FROM executions e
WHERE t.execution_id = e.id
  AND t.tenant_id IS NULL;
```

### 14.3 Rollout order

1. Deploy code that writes `tenant_id` everywhere but RLS still disabled.
2. Backfill existing rows.
3. Add indexes.
4. Enable RLS in staging.
5. Run integration tests.
6. Enable RLS in production during low-traffic window.
7. Monitor `tenant_context_missing`, RLS denials, p95 latency and DB CPU.

---

## 15. Implementation Blueprint

### 15.1 NestJS auth module

```typescript
@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        audience: config.getOrThrow('JWT_AUDIENCE'),
        issuer: config.getOrThrow('JWT_ISSUER'),
        algorithms: ['RS256'],
      }),
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard, TenantScopeGuard, RbacGuard, JwksClient],
  exports: [JwtAuthGuard, TenantScopeGuard, RbacGuard, JwtModule],
})
export class JwtAuthModule {}
```

### 15.2 JWT strategy

```typescript
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(private readonly config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: jwksRsa.passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: config.getOrThrow<string>('JWT_JWKS_URI'),
      }),
      algorithms: ['RS256'],
      audience: config.get<string>('JWT_AUDIENCE', 'octo-web'),
      issuer: config.get<string>('JWT_ISSUER', 'octo-api'),
    });
  }

  async validate(payload: unknown): Promise<OctoJwtPayload> {
    const parsed = OctoJwtPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      throw new UnauthorizedException('Invalid JWT payload');
    }
    return parsed.data;
  }
}
```

### 15.3 Tenant scope guard

```typescript
@Injectable()
export class TenantScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<OctoRequest>();
    const user = request.user as OctoJwtPayload | undefined;

    if (!user?.tenant_id) {
      throw new ForbiddenException('No tenant context in token');
    }

    if (request.body && 'tenant_id' in request.body) {
      throw new BadRequestException('tenant_id must not be provided in request body');
    }

    request.tenantId = user.tenant_id;
    request.userId = user.sub;
    request.roles = user.roles;
    request.scopes = user.scopes;

    return true;
  }
}
```

### 15.4 Python worker transaction helper

```python
from contextlib import asynccontextmanager
from sqlalchemy.ext.asyncio import AsyncConnection
from sqlalchemy import text

@asynccontextmanager
async def tenant_transaction(conn: AsyncConnection, tenant_id: str):
    if not tenant_id or ":" in tenant_id or "'" in tenant_id:
        raise ValueError(f"Invalid tenant_id: {tenant_id!r}")

    async with conn.begin():
        await conn.execute(
            text("SELECT set_config(:key, :value, true)"),
            {"key": "app.current_tenant", "value": tenant_id},
        )
        yield conn
```

### 15.5 Queue payload contract

```typescript
export const ExecutionJobPayloadSchema = z.object({
  executionId: z.string().min(1),
  runId: z.string().min(1),
  agentId: z.string().min(1),
  tenantId: z.string().min(1),
  attempt: z.number().int().nonnegative(),
  traceId: z.string().min(1),
  createdAt: z.string().datetime(),
  source: z.enum(['api', 'scheduler', 'reclaim', 'retry']),
});
```

### 15.6 Startup health checks

API startup must fail if:

- DB role has `BYPASSRLS`.
- Any required F1 table lacks RLS.
- Any required F1 table lacks `tenant_id`.
- `JWT_JWKS_URI` is missing in production.
- JWT signing algorithm is not RS256 in production.
- SecretRef resolution fails.

Worker startup must fail if:

- service auth config is missing,
- service token audience is not `octo-internal`,
- worker cannot execute a tenant-scoped dry-run transaction,
- Redis wrapper is bypassed in configuration.

---

## 16. Cross-Framework Inspiration

The ADR intentionally adapts proven patterns from agent frameworks, workflow engines and production guidance, but does not copy any one project's implementation.

| Source | Relevant pattern | OCTO adoption |
|---|---|---|
| CrewAI | Role-oriented agents, delegation, structured collaboration. | Keeps tenant isolation separate from agent roles and delegation topology. |
| LangGraph | Durable state, checkpoints, thread/checkpoint IDs, checkpoint namespaces. | Checkpoints remain execution state; tenant identity lives in OCTO execution metadata and RLS columns. |
| Flowise | Visual builder and operational audit surfaces. | Security events and runtime state are visible in Ops/Dashboard, not hidden in worker logs. |
| Semantic Kernel | Plugin/function contracts and typed capabilities. | Tool and service scopes are explicit claims and policies, not implicit function access. |
| Hermes Chief of Staff | Coordinator/assistant pattern. | Service identities can coordinate runs without inheriting end-user JWTs. |
| Microsoft Agent Framework | Agent protocols, production workflows, observability. | Internal services authenticate independently and emit traces/spans. |
| n8n | Workflow execution, credential separation, operational isolation. | Workflow-style execution still uses API auth, DB ownership and audit events. |
| AutoGen | Multi-agent conversations and manager/worker roles. | Worker identities are scoped services, not user impersonation. |
| Paperclip | Budgets, evals, governance, cost tracking. | Tenant scope flows into token/cost accounting and budget enforcement. |
| Lattice / Neurite / AgentNeo / AgenticLens / WorkGraph | Graph visibility and traceability. | Security boundaries are represented in traces and execution graph metadata. |
| Rowboat | Persistent memory, artifacts, MCP-oriented extensibility. | Future memory/artifact rows inherit the same tenant/RLS model. |
| Microsoft AI Agents for Beginners | Trustworthy agents, privacy, observability, production evaluation. | Tenant isolation, auditability and traceability are blocking requirements for production agents. |

### 16.1 Design rule derived from references

Agent frameworks optimize for orchestration and cognition; OCTO must additionally behave like infrastructure. Therefore, tenant isolation is not modeled as an agent capability. It is a lower-level platform invariant enforced by auth, database policy, queues, Redis, observability and tests.

---

## 17. Alternatives Rejected

### 17.1 Application-only `WHERE tenant_id = ...`

Rejected because a single missing predicate can expose data cross-tenant. RLS is required as a last line of defense.

### 17.2 Separate database per tenant in F1

Rejected for F1 because it complicates migrations, scheduler scans, checkpoint recovery, observability, local development and cost. Can be revisited for high-compliance deployments later.

### 17.3 Separate schema per tenant

Rejected for F1 because it increases migration complexity and conflicts with SQL-first simplicity. RLS gives enough isolation for the initial production-ready F1 target.

### 17.4 Tenant from request body

Rejected because body is user-controlled and spoofable.

### 17.5 Worker superuser bypass

Rejected because workers handle the most sensitive execution data. Giving them superuser or `BYPASSRLS` would turn worker compromise into full-tenant compromise.

### 17.6 Encode tenant in LangGraph `checkpoint_ns`

Rejected. `checkpoint_ns` is for graph/subgraph checkpoint namespace semantics. Tenant identity remains application metadata and database policy.

---

## 18. Consequences

### 18.1 Positive

- Tenant isolation is enforced even if a repository query forgets a predicate.
- JWT claims provide a single authoritative source of tenant identity.
- RLS reduces silent cross-tenant leakage risk.
- 404 behavior reduces resource enumeration.
- Service auth limits blast radius of workers.
- Redis namespace avoids cache/key collisions.
- Audit events make suspicious access reconstructable.
- The model applies uniformly to executions, checkpoints, approvals, tools and future memory/artifacts.

### 18.2 Negative

- Every transaction must set tenant context.
- Tests must use real PostgreSQL, not only mocks.
- RLS can add latency without correct indexes.
- Workers need explicit tenant propagation from queue payloads.
- Scheduler/reclaimer logic must iterate tenants carefully instead of using global bypass.
- Security operations need separate, audited cross-tenant read paths.

### 18.3 Operational tradeoff

The added complexity is accepted because tenant isolation bugs are Sev-1/Critical. F1 cannot be declared stable if the platform can leak prompts, tool outputs, checkpoints or approvals across tenants.

---

## 19. Invariants

**I-T1 — Tenant ID source**  
`tenant_id` for user requests comes only from a validated JWT. It never comes from request body, querystring or unsigned headers.

**I-T2 — Tenant column**  
Every F1 business table has `tenant_id TEXT NOT NULL` or an explicit documented exemption.

**I-T3 — RLS enabled**  
Every F1 business table has RLS enabled before F1 STABLE.

**I-T4 — No BYPASSRLS**  
Application and worker DB roles must not have `BYPASSRLS`.

**I-T5 — Transaction context**  
Every business transaction must execute `set_config('app.current_tenant', tenantId, true)` before data access.

**I-T6 — 404 on cross-tenant resource access**  
Cross-tenant access to a known resource returns 404, not 403.

**I-T7 — Redis tenant prefix**  
No tenant-scoped Redis key may omit `octo:{tenant_id}:`.

**I-T8 — Event tenant propagation**  
Every tenant-scoped event includes `tenant_id`.

**I-T9 — Worker user-token isolation**  
Workers do not reuse user JWTs for internal service calls.

**I-T10 — Queue payload tenant validation**  
Worker payload `tenantId` must match the tenant on the execution row visible under RLS.

**I-T11 — Auditability**  
Security-relevant auth, scope, RLS and tenant ownership failures emit structured audit events.

**I-T12 — Hierarchy orthogonality**  
Agent hierarchy remains in `agent-core`; tenancy remains in security/data ownership layers.

---

## 20. Validation and Test Suite

The following tests are blocking for F1 COMPLETE.

### 20.1 Integration tests

| Test | Expected result |
|---|---|
| Tenant A reads Tenant B execution | `404 Not Found` |
| Tenant A cancels Tenant B execution | `404 Not Found` |
| Request body includes `tenant_id` | `400 Bad Request` or ignored with explicit test; preferred: reject. |
| Expired JWT | `401 Unauthorized` |
| Wrong audience | `401 Unauthorized` |
| Unknown `kid` | `401 Unauthorized` |
| Missing `executions:write` scope | `403 Forbidden` |
| DB query without tenant context | zero rows or RLS error; never data leakage. |
| Insert row with mismatched `tenant_id` | RLS `WITH CHECK` violation. |
| Worker job with mismatched tenant payload | terminal security error + audit event. |
| Redis key without tenant prefix | wrapper throws; test fails if raw client is used. |
| App DB role has `BYPASSRLS` | startup health check fails. |

### 20.2 Load tests

- RLS overhead must remain below 5% p95 latency for core F1 queries under target single-region load.
- `idx_executions_tenant_state_created` must be used for execution list queries.
- `idx_execution_steps_tenant_execution_step` must be used for timeline queries.
- `idx_checkpoints_tenant_execution_step` must be used for checkpoint recovery.

### 20.3 Security regression tests

- Mutation attempts with spoofed `tenant_id`.
- Direct repository call outside `TenantAwareDbService` detected by lint/test.
- Service token used against user endpoint rejected.
- User token used against internal worker endpoint rejected.
- Audit log written for forbidden scope and suspicious resource access.

### 20.4 CI requirements

- Use real PostgreSQL with RLS enabled.
- Use real Redis for namespace tests.
- Do not mock RLS behavior in F1 acceptance tests.
- Include migration smoke test from empty DB and from F0-like DB.

---

## 21. Exit Criteria Integration

F1 COMPLETE requires:

- `JWTAuthModule` implemented.
- `TenantScopeGuard` and `RbacGuard` active on all protected endpoints.
- RLS migrations applied.
- RLS tests passing in CI.
- `tenant_id` present in all F1 business tables.
- Redis namespace wrapper used by runtime, scheduler and API.
- Service authentication implemented for runtime-worker and scheduler-worker.
- Execution ownership returns 404 for cross-tenant references.
- Audit events emitted for auth/security failures.
- Startup health checks verify no `BYPASSRLS` and required RLS state.

F1 STABLE additionally requires:

- No Sev-1 tenant isolation incidents.
- Load test validates RLS overhead target.
- Security dashboard includes auth, scope, RLS and cross-tenant signals.
- Runbook exists for RLS-denied spike and cross-tenant access attempts.

---

## 22. Related ADRs

| ADR | Relationship |
|---|---|
| ADR-F1-001 — Durable Execution Semantics | Execution rows and state transitions are tenant-scoped. |
| ADR-F1-002 — Replay Semantics and Determinism Rules | Replay must never cross tenant boundaries. |
| ADR-F1-003 — Checkpoint Persistence Model and Lineage Validation | Checkpoint tables include `tenant_id` and RLS policies. |
| ADR-F1-004 — LiteLLM Abstraction and Provider Routing Boundary | LLM usage metadata includes `tenant_id` for cost and audit. |
| ADR-F1-006 — Event Bus Split | Events carry `tenant_id`; commands carry tenant context. |
| ADR-F1-007 — Tool Sandboxing, Approval Policies and MCP Compatibility | Tool invocation permissions include tenant and agent policy. |

---

## 23. References

### OCTO internal sources

- Issue [#98 — F1-ADR-005 Tenant Isolation, JWT y RLS](https://github.com/lssmanager/OCTO/issues/98)
- `OCTO-v5-arquitectura.md`
- `F0.md`
- `F1.md`
- `docs/adr/F1/F1-ADR-003-checkpoint-persistence-model-and-lineage-validation.md`

### External technical references

- PostgreSQL Documentation — Row Security Policies: https://www.postgresql.org/docs/current/ddl-rowsecurity.html
- RFC 6749 — OAuth 2.0 Authorization Framework, Client Credentials Grant: https://datatracker.ietf.org/doc/html/rfc6749#section-4.4
- LangGraph Persistence Documentation: https://docs.langchain.com/oss/python/langgraph/persistence
- Microsoft AI Agents for Beginners — Building Trustworthy Agents: https://microsoft.github.io/ai-agents-for-beginners/translations/es/06-building-trustworthy-agents/
- Microsoft AI Agents for Beginners — Agents in Production / Observability and Evaluation: https://microsoft.github.io/ai-agents-for-beginners/translations/es/10-ai-agents-production/

### Inspiration repositories and product references

- CrewAI: https://github.com/crewaiinc/crewai
- LangGraph: https://github.com/langchain-ai/langgraph
- Flowise: https://github.com/flowiseai/flowise
- Semantic Kernel: https://github.com/microsoft/semantic-kernel
- Hermes Chief of Staff: https://github.com/TheCraigHewitt/hermes-chief-of-staff
- Microsoft Agent Framework: https://github.com/microsoft/agent-framework
- n8n: https://github.com/n8n-io/n8n
- AutoGen: https://github.com/microsoft/autogen
- Paperclip: https://github.com/paperclipai/paperclip
- Lattice: https://github.com/DahunHan/lattice
- Neurite: https://github.com/satellitecomponent/Neurite
- Neurite fork: https://github.com/silvadirceu/Neurite
- AgentNeo: https://github.com/GOURIKP/AgentNeo
- AgentNeo official org: https://github.com/raga-ai-hub/agentneo
- noaide: https://github.com/silentspike/noaide
- Agent Lens: https://github.com/23min/agent-lens
- AgentLens: https://github.com/farzanhossan/agentlens
- Agent WorkGraph: https://github.com/ranausmanai/agent-workgraph
- Rowboat: https://github.com/rowboatlabs/rowboat
