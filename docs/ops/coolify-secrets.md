# Coolify Secrets — Runbook de Configuración Segura

> **Acción requerida antes de cualquier deploy a producción.**
> Las credenciales que aparecen como Build Variables quedan grabadas en
> las capas de la imagen Docker y son visibles con `docker history`.

---

## Por qué importa ARG vs ENV

| Mecanismo | Cómo funciona | Riesgo |
|-----------|--------------|--------|
| `ARG` (Build Variable) | Inyectado en tiempo de `docker build`. Queda en la caché de cada layer del Dockerfile que lo referencia. | **Visible en `docker history --no-trunc <image>`**. Cualquier persona con acceso a la imagen puede extraer el valor. |
| `ENV` (Environment Variable) | Inyectado en tiempo de `docker run`. No existe en las capas de build. | Solo visible dentro del contenedor en ejecución. Es la ubicación correcta para secrets. |

**Regla absoluta:** ningún secret, credencial, o token debe aparecer
jamás como Build Variable en Coolify.

---

## Tabla: Clasificación Correcta por Variable

| Variable | Tipo correcto | Motivo |
|----------|--------------|--------|
| `DATABASE_URL` | ✅ Environment Variable | Credencial de base de datos |
| `REDIS_URL` | ✅ Environment Variable | Credencial de Redis |
| `REDIS_PASSWORD` | ✅ Environment Variable | Credencial de Redis |
| `JWT_SECRET` | ✅ Environment Variable | Secret criptográfico |
| `LITELLM_MASTER_KEY` | ✅ Environment Variable | API key de LLM |
| `RUNTIME_API_SECRET` | ✅ Environment Variable | Inter-service secret |
| `POSTGRES_PASSWORD` | ✅ Environment Variable | Credencial de base de datos |
| `LOG_LEVEL` | ✅ Environment Variable | Configuración runtime |
| `DB_POOL_MAX` | ✅ Environment Variable | Configuración runtime |
| `BUILD_VERSION` | ✅ Build Variable | Metadato de build, no es secret |
| `BUILD_COMMIT` | ✅ Build Variable | Metadato de build, no es secret |
| `BUILD_PHASE` | ✅ Build Variable | Metadato de build, no es secret |
| `BUILD_TIME` | ✅ Build Variable | Metadato de build, no es secret |

---

## Procedimiento: Mover Variables a Environment Variables

### Paso 1 — Identificar Build Variables actuales

1. Abre Coolify → selecciona la aplicación **OCTO API**.
2. Ve a **Environment Variables**.
3. Busca el toggle o etiqueta **"Build Variable"** / **"Build time"**
   junto a cada variable.
4. Identifica cuáles de las siguientes están marcadas como Build Variable:
   - `DATABASE_URL`
   - `REDIS_URL`
   - `DB_POOL_MAX`
   - `LOG_LEVEL`
   - Cualquier otra variable que contenga password, secret, key, token, o url.

### Paso 2 — Convertir a Environment Variable (runtime)

Para **cada una** de las variables identificadas en el paso 1:

1. Haz clic en la variable.
2. **Desmarca** el checkbox “Build Variable” / “Build time”.
3. Asegúrate de que el valor esté presente (no vacío).
4. Guarda el cambio.

> En Coolify, una variable sin el flag “Build Variable” es automáticamente
> una Environment Variable — se inyecta como `-e VAR=value` en `docker run`,
> no como `--build-arg VAR=value` en `docker build`.

### Paso 3 — Eliminar duplicados en Build Variables

Si la variable aparece en ambos lugares (Build + Runtime), elimina
la entrada de Build Variables. Solo debe existir en Environment Variables.

### Paso 4 — Redeploy

1. En Coolify → OCTO API → haz clic en **Deploy**.
2. Espera a que el build complete.
3. Verifica que la API responde: `curl https://<tu-dominio>/api/health/live`

### Paso 5 — Verificación post-fix

Ejecuta en el servidor donde corre Docker:

```bash
# Obtén el ID de la imagen recién construida
docker images | grep octo-api

# Verifica que ninguna credencial aparece en el historial de capas
docker history --no-trunc <IMAGE_ID> | grep -iE '(password|secret|database_url|redis_url|jwt)'
```

El comando `grep` debe devolver **output vacío**.
Si aparece algún valor, significa que la variable aún está en Build Variables
y debes repetir el procedimiento.

---

## Variables que JAMÁS deben ser Build Variables

- Cualquier `*_URL` que contenga usuario/contraseña en el connection string
- Cualquier `*_PASSWORD`, `*_SECRET`, `*_KEY`, `*_TOKEN`
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `LITELLM_MASTER_KEY`,
  `RUNTIME_API_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`

---

## Variables que SÍ pueden ser Build Variables

Solo metadatos de build que no contienen información sensible:

- `BUILD_VERSION`
- `BUILD_COMMIT`
- `BUILD_PHASE`
- `BUILD_TIME`

Estas variables se graban intencionalmente en la imagen para trazabilidad
(visibles en `docker inspect`).

---

## Referencia: Documentación Relacionada

- [Coolify Environment Variables](https://coolify.io/docs/knowledge-base/environment-variables)
- [Docker ARG vs ENV](https://docs.docker.com/engine/reference/builder/#arg)
- ADR F0-016 (env config), ADR F0-014 (Dockerfile strategy)

---

## F1 Public Surface and Build Metadata

> Routing decision: `https://agents.socialstudies.cloud/` is the API-only F1
> resource and must route to container port `3001`. See
> [`docs/ops/coolify-routing.md`](./coolify-routing.md) for the complete
> API-vs-web decision and post-deploy checks.

For issue #263/F1 closeout, the public Coolify route must point to the API
container port `3001`. The OCTO API listens on `PORT=3001`, exposes
`EXPOSE 3001`, and serves these public verification URLs:

- `https://agents.socialstudies.cloud/` — lightweight OCTO F1 operational surface.
- `https://agents.socialstudies.cloud/api/health/live` — container/process liveness.
- `https://agents.socialstudies.cloud/api/health/ready` — strict dependency readiness
  (PostgreSQL/Redis/LiteLLM/queue checks; returns 503 when dependencies are unhealthy).
- `https://agents.socialstudies.cloud/api/health/version` — build metadata used by the
  F1 close gate.

If Coolify/Traefik is configured with an application port, use `3001` for the API
service. Port `3100` is reserved for a separate web console deployment and should not
be used for the API-only Coolify application unless a distinct `apps/web` service is
being deployed and routed intentionally.

Configure these non-secret build metadata variables in Coolify for F1 close deploys:

| Variable | Recommended F1 value | Notes |
|----------|----------------------|-------|
| `BUILD_PHASE` | `F1` | Required for `/api/health/version` to prove F1 closure. |
| `BUILD_VERSION` | release/tag value, for example `0.1.0-f1` | Must not be `unknown` in close-gate deploys. |
| `BUILD_COMMIT` | `${SOURCE_COMMIT}` when Coolify exposes it, otherwise the Git SHA | Must not be `unknown` in close-gate deploys. |
| `SOURCE_COMMIT` | Coolify-provided Git SHA when available | The Dockerfiles default `BUILD_COMMIT` from this value when explicit `BUILD_COMMIT` is absent. |
| `BUILD_TIME` | ISO-8601 UTC timestamp from the deployment | Must not be `unknown` in close-gate deploys. |

These values are safe as Build Variables because they are metadata, not secrets. Do
not place `DATABASE_URL`, `REDIS_URL`, JWT secrets, LiteLLM keys, or inter-service
secrets in Build Variables.

Local/public smoke examples:

```bash
curl -i http://localhost:3001/
curl -i http://localhost:3001/api/health/live
curl -i http://localhost:3001/api/health/ready
curl -s http://localhost:3001/api/health/version
F1_PUBLIC_URL=https://agents.socialstudies.cloud bash scripts/f1-smoke.sh --health
```
