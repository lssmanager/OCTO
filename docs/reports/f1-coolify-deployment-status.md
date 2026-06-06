# F1 Coolify Deployment Status

Fecha de evidencia: 2026-06-06 22:38 UTC
URL publica: https://agents.socialstudies.cloud/
Commit desplegado: `2be6f23359ef97ef40dc7efe7b6256d17b0ec993`
Version: `0.1.0-f1`
Fase reportada: `F1`
Servicio publico observado: `octo-api`

## Resumen ejecutivo

El despliegue actual en Coolify demuestra que la superficie publica del Control Plane API de OCTO esta viva y reachable. Tambien demuestra conectividad basica con PostgreSQL, Redis y la cola `execution.dispatch` desde el readiness del API.

Este reporte no declara F1 cerrada. El despliegue actual todavia no pasa readiness completo porque LiteLLM falla, y la evidencia disponible muestra principalmente una superficie API, no el stack F1 completo con web, runtime-worker, scheduler-worker, reclaimer-worker, outbox-publisher-worker y LiteLLM healthy.

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

La pagina indica explicitamente que es una superficie operacional ligera del Control Plane y que no ejecuta dependency checks estrictos; para eso se debe usar readiness.

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
| Infra | 88% | Coolify despliega API publica; falta stack F1 completo o decision documentada API-first. |
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

Resolver primero #287 porque LiteLLM es el bloqueo directo de readiness. Luego resolver #286 para alinear Coolify con el stack F1 requerido. Despues ejecutar los smokes/gates de #288, #289, #290 y #291, y finalmente cerrar #281 con `pnpm f1:close-gate` en PASS.
