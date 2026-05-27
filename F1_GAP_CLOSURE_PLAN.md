# F1 Gap Closure Plan (Executable)

## 1) Diagnóstico exacto

1. **Auth en control plane no está aplicado por guardia en controladores críticos**.
   - `ExecutionController` y `AgentController` consumen `req.user` con helpers locales (`requirePrincipal`/`mustPrincipal`) pero no aplican `@UseGuards(JwtAuthGuard, TenantScopeGuard)` ni `@RequireScopes`/RBAC en endpoints. Resultado: depende de wiring global implícito y no de enforcement local explícito.  
2. **Runtime dividido entre rutas y motores incompatibles**.
   - `/api/v1/execute` usa `ExecutionService` (F0 scaffold), mientras `/execute/internal` llama `run_f1_execution` que escribe directo a Postgres. Existe dualidad de contrato y de side-effects.  
3. **Violación de boundaries arquitectónicos en runtime**.
   - `f1_runtime.py` hace transacciones SQL directas (`executions`, `execution_checkpoints`, `execution_steps`, `outbox_events`) desde execution plane; contradice separación control/execution plane indicada en `engine.py`.  
4. **Loop durable LLM→Tool→Checkpoint inexistente**.
   - `f1_runtime.py` hace una transición fija `DISPATCHED→RUNNING→SUCCEEDED` con output fake/runtime-response; no hay iteración, registry, ni tool chaining.  
5. **Reclaim parcial: CAS existe pero semántica total no está cerrada**.
   - `cas-reclaim.ts` implementa CAS sobre `status='running'` + lease vencido, pero `reclaim-loop.ts` re-encola con payload mínimo y jobId temporal sin handshake explícito con scheduler retry policy/DLQ contract unificado.  
6. **Stubs operativos activos en API**.
   - `RuntimeModule` y `OpsModule` inyectan servicios fake con métricas/health hardcodeados.
7. **Deploy incompleto para F1**.
   - `docker-compose.yml` levanta `api`, `runtime-worker`, `postgres`, `redis`, `litellm`, pero no `scheduler-worker` ni `reclaimer-worker`.

## 2) Root causes

- **Migración incompleta F0→F1**: coexistencia de scaffold F0 y runtime F1 provisional.
- **Contratos de ownership difusos**: runtime escribe SoR directamente y también existe engine que declara lo contrario.
- **Falta de state machine única**: estados/attempt/lease se mutan desde componentes distintos sin un único orquestador de transición.
- **Auth sin policy lattice jerárquica**: tenant se valida, pero no agency/workspace/role/scope en borde del endpoint.
- **Observabilidad y ops no conectadas a fuentes reales**: módulos de operación con factories mock.

## 3) Archivos afectados

- Auth/API:
  - `apps/api/src/execution/execution.controller.ts`
  - `apps/api/src/agents/agent.controller.ts`
  - `apps/api/src/auth/jwt-auth.guard.ts`
  - `apps/api/src/auth/guards/tenant-scope.guard.ts`
- Runtime:
  - `apps/runtime-worker/src/routers/execute.py`
  - `apps/runtime-worker/src/execution/engine.py`
  - `apps/runtime-worker/src/f1_runtime.py`
- Recovery:
  - `apps/reclaimer-worker/src/reclaim-loop.ts`
  - `apps/reclaimer-worker/src/cas-reclaim.ts`
  - `apps/scheduler-worker/src/dispatch-handler.ts` (alineación de contrato)
  - `apps/api/src/execution/execution-reclaim.service.ts` (alineación de orchestration)
- Ops/Runtime stubs:
  - `apps/api/src/runtime/runtime.module.ts`
  - `apps/api/src/ops/ops.module.ts`
- Deploy:
  - `docker-compose.yml`
- DB/tooling:
  - `packages/database/src/schema/tool-invocations.ts`
  - nuevas migraciones para snapshots/timeline/tool results/leases DLQ si faltan constraints.

## 4) Refactor plan

### Fase A — Seguridad y contratos (bloqueante)
1. Aplicar guards explícitos en controllers F1 (`JwtAuthGuard`, `TenantScopeGuard`, `RbacGuard` donde aplique).
2. Introducir decorators de scopes por endpoint (`execution:create/read/cancel/resume`, `agent:*`).
3. Agregar `HierarchyAccessService` para validar `tenant_id + agency_id + workspace_id` contra principal.
4. E2E de denegación cross-tenant/cross-agency/cross-workspace.

### Fase B — Runtime único durable
1. Retirar `/execute/internal` y mover todo a `ExecutionEngine` como único entrypoint.
2. Convertir `ExecutionService.run()` en adaptador del engine (sin stub).
3. Eliminar `f1_runtime.py` o reducirlo a wrapper que delega al engine sin SQL directo.
4. Definir máquina de estados determinística con transiciones permitidas y CAS versionado.

### Fase C — Agentic loop durable
1. Implementar `ReasoningLoop` persistente:
   - step `llm_request` → `llm_response` → `tool_decision` → `tool_execute` → checkpoint.
2. Integrar LiteLLM real con retry/backoff/timeout/fallback/provider policy.
3. Persistir usage/tokens/cost por step y acumulado por ejecución.
4. Reanudar desde checkpoint por `step_index + cursor` idempotente.

### Fase D — Tooling durable
1. Crear `ToolRegistry` + `ToolExecutor` + `ToolPolicyEngine`.
2. Enforce de schema (JSON schema/Pydantic) y permisos jerárquicos.
3. Persistencia completa en `tool_invocations` + timeline de errores/resultados.

### Fase E — Recovery/reclaim end-to-end
1. Unificar semántica lease/heartbeat entre scheduler, runtime y reclaimer.
2. Añadir `execution_lease_owner`, `lease_token`, `lease_heartbeat_at` y CAS por token.
3. Implementar DLQ real + poison handling + max attempts terminal.
4. Tests de crash recovery y duplicate suppression.

### Fase F — Ops real + observabilidad + deploy
1. Reemplazar providers mock de Runtime/Ops por clientes reales (Redis, Postgres, queue, workers).
2. Añadir métricas OTEL y trazas por executionId/traceId/correlationId.
3. Extender docker-compose con scheduler y reclaimer + checks + startup ordering.

## 5) Código propuesto (esqueleto de implementación)

- **NestJS (controllers)**
  - Anotar clases con `@UseGuards(JwtAuthGuard, TenantScopeGuard, RbacGuard, HierarchyAccessGuard)`.
  - Usar `@RequireScopes('execution:create')` etc.
  - Resolver principal con decorator typed (`@CurrentUser()`) y no `@Req` manual.
- **Runtime router**
  - `POST /execute` llama sólo `ExecutionEngine.run(request, attempt)`.
  - Eliminar endpoint `/execute/internal`.
- **Engine**
  - Separar `StateTransitionStore` (CAS SQL via control plane API/event), `CheckpointStore`, `ToolInvocationStore`.
  - Implementar `while not terminal` con transiciones determinísticas.
- **Tool execution**
  - `ToolExecutor.execute(invocation)` con timeout/retry/policy evaluation previa.
- **Recovery**
  - `ReclaimCoordinator` verifica heartbeat staleness + lease token CAS + requeue reason code.

## 6) Migraciones DB necesarias

1. **execution leases hardening**
   - columnas: `lease_owner`, `lease_token`, `lease_heartbeat_at`, `last_reclaim_reason`.
   - índice compuesto `(status, lease_expires_at)` y `(lease_token)`.
2. **tool durability**
   - `tool_invocations`: `attempt`, `started_at`, `completed_at`, `timeout_ms`, `input_json`, `output_json`, `error_json`, `policy_snapshot_json`.
   - índices por `(execution_id, step_index)` y `(status, updated_at)`.
3. **execution timeline/checkpoint metadata**
   - checkpoint cursor determinístico (`loop_cursor`, `reasoning_step_kind`, `llm_request_id`).
4. **DLQ**
   - tabla/estado normalizado con `reason`, `first_failed_at`, `last_failed_at`, `retry_after`.

## 7) Riesgos

- **Riesgo de regresión de compatibilidad** al retirar rutas legacy (`/execute/internal`).
- **Riesgo de carrera** en reclaim si no se unifica lease token en todos los workers.
- **Riesgo de costo LLM** por loops sin límites; requiere budget caps por execution.
- **Riesgo operacional** al activar checks reales sin observabilidad suficiente (falsos negativos).

## 8) Plan incremental seguro

1. Feature flags por capability (`AUTH_STRICT`, `RUNTIME_UNIFIED`, `TOOL_DURABLE`, `RECLAIM_V2`).
2. Dark launch de engine unificado con shadow writes/checksums.
3. Canary por workspace/agency.
4. Cutover gradual con rollback plan por flag.
5. Congelar schema changes behind backward-compatible migrations.

## 9) Checklist de cierre F1

- [ ] Endpoints F1 con guards + scopes + RBAC + jerarquía agency/workspace.
- [ ] Un único pipeline de ejecución durable en runtime.
- [ ] Loop LLM→Tool→Checkpoint funcional con resume/replay.
- [ ] Tool registry/executor/policies persistentes.
- [ ] Reclaim deterministic con CAS robusto + DLQ real.
- [ ] Sin stubs en módulos Ops/Runtime API.
- [ ] Docker compose con todos los workers F1 + health/readiness.
- [ ] OTEL + logs estructurados + correlation IDs.
- [ ] Suite e2e/replay/reclaim/auth isolation verde.

## 10) Definition of Done F1

F1 se considera cerrado cuando:
1. No existen rutas execution legacy/stub activas en producción.
2. Toda ejecución es reanudable desde checkpoint sin pérdida ni duplicación.
3. Auth y autorización jerárquica niegan sistemáticamente accesos cross-boundary.
4. Reclaimer recupera ejecuciones stuck sin doble procesamiento.
5. Observabilidad permite reconstruir una ejecución completa (API→scheduler→runtime→reclaimer).
6. CI contiene pruebas determinísticas de replay/reclaim/auth/tooling y todas pasan.
7. Stack self-hosted levanta de forma reproducible con compose completo.
