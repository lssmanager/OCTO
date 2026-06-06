# F1 Coolify Deployment Status

Fecha de evidencia: 2026-06-06 22:38 UTC; revalidado 2026-06-06 23:03 UTC
URL publica: https://agents.socialstudies.cloud/
Commit desplegado: `2be6f23359ef97ef40dc7efe7b6256d17b0ec993`
Version: `0.1.0-f1`
Fase reportada: `F1`
Servicio publico observado: `octo-api`

## Resumen ejecutivo

El despliegue actual en Coolify demuestra que la superficie publica del Control Plane API de OCTO esta viva y reachable. Tambien demuestra conectividad basica con PostgreSQL, Redis y la cola `execution.dispatch` desde el readiness del API.

Este reporte no declara F1 cerrada. El despliegue actual todavia no pasa readiness completo porque LiteLLM falla, y la evidencia disponible muestra una superficie API-only: `/status` devuelve 404 y `/` muestra `octo-api`, no la F1 Agent Graph Console. Por tanto, no hay prueba del stack F1 completo con `web`, `runtime-worker`, `scheduler-worker`, `reclaimer-worker`, `outbox-publisher-worker` y LiteLLM healthy.

## Evidencia observada

### Public root

`GET https://agents.socialstudies.cloud/`

Resultado observado:

- Status visible: `reachable`
- Producto: `OCTO`
- Servicio: `octo-api`
- Phase: `F1`
- Version: `0.1.0-f1`
- Commit: `2be6f23359ef`
- Built at: `local`
- Environment: `production`

La pagina indica explicitamente que es una superficie operacional ligera del Control Plane y que no ejecuta dependency checks estrictos; para eso se debe usar readiness. Esta evidencia confirma que el recurso publico observado sigue apuntando a la API, no al servicio `web`.

### Web status route

`GET https://agents.socialstudies.cloud/status`

Resultado revalidado el 2026-06-06 23:03 UTC: HTTP `404`.

Interpretacion: el servicio publico no esta renderizando la F1 foundation status UI requerida por el contrato web + API.

### Liveness

`GET https://agents.socialstudies.cloud/api/health/live`

Resultado observado:

```json
{
  "status": "ok",
  "timestamp": "2026-06-06T22:38:36.127Z"
}
```

Interpretacion: el proceso API esta vivo.

### Readiness

`GET https://agents.socialstudies.cloud/api/health/ready`

Resultado observado:

```json
{
  "status": "error",
  "ready": false,
  "timestamp": "2026-06-06T22:38:56.818Z",
  "checks": {
    "redis": {
      "status": "ok",
      "latencyMs": 66
    },
    "queue": {
      "status": "ok",
      "name": "execution.dispatch",
      "waitingCount": 0,
      "activeCount": 0,
      "failedCount": 0
    },
    "postgres": {
      "status": "ok",
      "latencyMs": 107
    },
    "litellm": {
      "status": "error",
      "error": "This operation was aborted"
    }
  }
}
```

Interpretacion:

- PostgreSQL: demostrado `ok` desde API.
- Redis: demostrado `ok` desde API.
- Queue `execution.dispatch`: demostrada `ok` desde API.
- LiteLLM: demostrado en fallo operacional.
- Readiness global: no apto para cierre F1.

### Version metadata

`GET https://agents.socialstudies.cloud/api/health/version`

Resultado observado:

```json
{
  "service": "octo-api",
  "version": "0.1.0-f1",
  "commit": "2be6f23359ef97ef40dc7efe7b6256d17b0ec993",
  "phase": "F1",
  "built_at": "local",
  "node": "v22.22.2"
}
```

Interpretacion: el API esta reportando metadata F1 coherente con el commit desplegado. `built_at: local` es aceptable como evidencia intermedia, pero para cierre formal F1 se recomienda metadata de build con timestamp UTC real.

### Endpoint interno F1 status

`GET https://agents.socialstudies.cloud/api/v1/ops/f1/status`

Resultado observado sin header interno:

```json
{
  "message": "Missing or invalid X-Internal-Secret header",
  "error": "Unauthorized",
  "statusCode": 401
}
```

Interpretacion: esto no es un fallo por si mismo. El endpoint esta protegido y requiere `X-Internal-Secret`. Debe validarse con el secret interno configurado en Coolify para confirmar que tambien funciona cuando se invoca autorizadamente.

## Estado por area tras esta evidencia

| Area | Estado actualizado | Lectura tecnica |
|---|---:|---|
| Backend | 92% | API publica viva, rutas F1 cargadas, pero falta smoke publico de Agent Graph con JWT y contrato completo. |
| Runtime Foundation | 55% | No demostrado por esta evidencia; rutas de runtime en API no prueban `runtime-worker` vivo. |
| Queues | 82% | Redis y `execution.dispatch` estan `ok`; faltan workers, dispatch durable, reclaim y outbox. |
| DB | 92% | Postgres y migraciones/API DB connectivity avanzan fuerte; falta runtime DB role smoke y aislamiento. |
| LLM Integration | 55% | LiteLLM esta demostrado como fallando readiness. |
| Infra | 82% | Coolify despliega API publica, pero `/status` 404 y `/` como `octo-api` confirman que todavia no demuestra el stack F1 completo. |
| Observabilidad | 76% | Health/version/logs basicos existen; falta observability gate y reconstruccion por IDs. |
| Seguridad | 78% | Endpoint interno protegido y no-root Dockerfile ayudan; faltan tenant isolation, runtime DB role, hardening y secretos. |

## Bloqueadores de cierre F1 derivados

Los siguientes issues bloquean el cierre total F1:

- #286 `[F1-INFRA] Desplegar y validar stack F1 completo en Coolify, no solo API`.
- #287 `[F1-LLM] Corregir LiteLLM readiness en Coolify para desbloquear cierre F1`.
- #288 `[F1-RUNTIME] Validar runtime-worker F1, handoff y rol DB de minimo privilegio en despliegue`.
- #289 `[F1-QUEUES] Validar workers, dispatch durable, reclaim y outbox en entorno Coolify`.
- #290 `[F1-BACKEND] Ejecutar smoke publico de Agent Graph y contrato backend F1 contra API desplegada`.
- #291 `[F1-OBS-SEC] Validar observabilidad, endpoints internos y gates de seguridad F1 en despliegue`.
- #281 se mantiene como issue paraguas de cierre F1.

## Regla de cierre

F1 no debe declararse al 100% mientras se cumpla cualquiera de estas condiciones:

- `/api/health/ready` devuelva `ready: false`.
- LiteLLM no aparezca `ok` en readiness.
- Solo exista evidencia de API publica y no del stack F1 completo o una decision formal API-first.
- No haya smoke publico de Agent Graph contra `https://agents.socialstudies.cloud/api`.
- No haya validacion de runtime-worker, workers de queue, outbox y runtime DB role.
- `docs/reports/f1-close-report.md` no muestre `Final decision: PASS`.

## Siguiente paso recomendado

Reconfigurar #286 como recurso Coolify Docker Compose usando `docker-compose.yml`, con `web:3000` como superficie publica y `/api/*` hacia `api:3001`. En paralelo, resolver #287 porque LiteLLM es el bloqueo directo de readiness. Despues ejecutar los smokes/gates de #288, #289, #290 y #291, y finalmente cerrar #281 con `pnpm f1:close-gate` en PASS.

## Actualizacion #288 — Runtime Worker F1 evidence closure patch (2026-06-06 23:31 UTC)

Revalidacion publica sin secreto interno:

- `GET https://agents.socialstudies.cloud/api/health/live` devolvio `200` con `status: ok`.
- `GET https://agents.socialstudies.cloud/api/health/ready` devolvio `503` con PostgreSQL, Redis y `execution.dispatch` en `ok`, y LiteLLM en `error: This operation was aborted`.
- `GET https://agents.socialstudies.cloud/api/health/version` sigue reportando `service: octo-api`, `version: 0.1.0-f1`, `phase: F1`, commit `2be6f23359ef97ef40dc7efe7b6256d17b0ec993`.
- `GET https://agents.socialstudies.cloud/status` sigue devolviendo `404 Cannot GET /status`, por lo que la evidencia publica continua indicando recurso API-only y no stack F1 completo.

Cambios operacionales preparados para cerrar #288 cuando #286 despliegue Compose completo:

- `docker-compose.yml` mantiene el servicio `runtime-worker` en el stack F1, sin inyectar `DATABASE_URL`, y ahora declara explicitamente `NODE_ENV=production`, `PORT=8000`, `RUNTIME_DATABASE_URL`, `API_URL`, `API_INTERNAL_SECRET`, Redis, LiteLLM (`LITELLM_BASE_URL`/`LITELLM_MASTER_KEY` y aliases compatibles), phase/version/commit y healthcheck propio en `/health/live`.
- `runtime-worker` ahora resuelve su DSN operativo desde `RUNTIME_DATABASE_URL` en production/F1 close; `DATABASE_URL` queda solo como fallback no productivo para tests locales legacy.
- `/health/status` queda como endpoint operativo interno para evidencia F1: worker type, env, phase, version, commit, conectividad DB usando `RUNTIME_DATABASE_URL` y ultimo heartbeat de `worker_heartbeats`.
- `scripts/f1-runtime-handoff-smoke.sh` queda agregado para validar `/health/live`, `/health/ready`, `/health/status`, handoff HTTP F1 directo con `202 Accepted`, visibilidad del worker desde el API runtime surface y evidencia en `worker_heartbeats` cuando hay `DATABASE_URL` administrativo disponible.
- `scripts/f1-verify.sh --close` ejecuta el smoke de runtime-worker despues de levantar el stack completo y antes del smoke publico estricto.

Esta actualizacion no marca `docs/reports/f1-close-report.md` como PASS. El cierre real requiere desplegar el Compose/resource correcto en Coolify, configurar secretos reales (`RUNTIME_API_SECRET`, `RUNTIME_POSTGRES_PASSWORD`, `RUNTIME_DATABASE_URL`, Redis y LiteLLM), ejecutar `scripts/f1-runtime-db-role-smoke.sh --strict`, ejecutar `pnpm f1:runtime-handoff-smoke` y finalmente `pnpm f1:close-gate` hasta PASS.
