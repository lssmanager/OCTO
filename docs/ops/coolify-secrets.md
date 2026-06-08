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

## Gate bloqueante de CI/CD

El workflow `Secret Scan` es una puerta **bloqueante** para merge a `main` y
para cualquier release: si detecta secretos en el repositorio o indicadores de
secretos en capas Docker, el cambio debe corregirse antes de merge/release. No
se aceptan bypasses temporales; cualquier allowlist debe quedar localizada en
`.gitleaks.toml` con una justificación concreta.

La puerta ejecuta dos controles complementarios:

1. Gitleaks con `.gitleaks.toml`, que extiende las reglas por defecto de
   Gitleaks y solo añade allowlists acotadas para falsos positivos conocidos.
2. Auditoría de `docker history --no-trunc` con detección amplia de nombres de
   variables que contengan `SECRET`, `TOKEN` o `PASSWORD`, además de nombres
   concretos como `DATABASE_URL`, `REDIS_URL`, `API_KEY` y
   `LITELLM_MASTER_KEY`.

Validación local del gate:

```bash
pnpm security:secret-scan-gate
```

La validación local crea fixtures temporales controlados y comprueba que el
gate falla ante un token de repositorio y ante variables genéricas como
`FUTURE_RUNTIME_TOKEN`/`APP_PASSWORD` en Docker history.

---

## Tabla: Clasificación Correcta por Variable

| Variable | Tipo correcto | Motivo |
|----------|--------------|--------|
| `DATABASE_URL` | ✅ Environment Variable | Credencial de base de datos |
| `REDIS_URL` | ✅ Environment Variable | Credencial de Redis |
| `REDIS_PASSWORD` | ✅ Environment Variable | Credencial de Redis |
| `JWT_SECRET` | ✅ Environment Variable | Secret criptográfico |
| `LITELLM_MASTER_KEY` | ✅ Environment Variable | API key de LLM |
| `INTERNAL_SECRET` | ✅ Environment Variable | Inter-service secret |
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
scripts/audit-docker-history-secrets.sh --image <IMAGE_ID>
```

El comando debe terminar con `PASS`. Si reporta `FAIL` y muestra una
línea del historial, significa que la variable aún está en Build Variables y
debes repetir el procedimiento.

---

## Variables que JAMÁS deben ser Build Variables

- Cualquier `*_URL` que contenga usuario/contraseña en el connection string
- Cualquier `*_PASSWORD`, `*_SECRET`, `*_KEY`, `*_TOKEN`
- `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `LITELLM_MASTER_KEY`,
  `INTERNAL_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`

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

> Routing decision for #286: F1 is a **Docker Compose web + API stack**, not an
> API-only Dockerfile application. The observed API-only deployment proves that
> `octo-api` is reachable, but it does not satisfy the F1 close contract until
> the `web`, `api`, PostgreSQL, Redis, LiteLLM, worker and migration services are
> deployed and validated together.

Coolify must use these source settings for the F1 production resource:

| Setting | Required value |
|---|---|
| Resource type | Docker Compose |
| Compose source | `docker-compose.yml` |
| Do not use | root `Dockerfile` as the F1 production resource |
| Public web service | `web` on container port `3000` |
| Internal API service | `api` on container port `3001` |
| API routing | `/api/*` to `api:3001`, either through path routing or a dedicated API hostname |

The canonical public verification URLs are:

- `https://agents.socialstudies.cloud/` — F1 Agent Graph Console rendered by `web`.
- `https://agents.socialstudies.cloud/status` — foundation/service status rendered by `web`.
- `https://agents.socialstudies.cloud/api/health/live` — API process liveness.
- `https://agents.socialstudies.cloud/api/health/ready` — strict dependency readiness
  for PostgreSQL, Redis, queue `execution.dispatch` and LiteLLM.
- `https://agents.socialstudies.cloud/api/health/version` — API build metadata used by
  the F1 close gate.

If Coolify cannot express same-host path routing for one compose resource, use a
separate API hostname/resource and document the exact URL split in
`docs/ops/coolify-routing.md` and `docs/reports/f1-coolify-deployment-status.md`.
Do not silently fall back to API-only.

Configure these variables as **Environment Variables** (runtime variables, not
Build Variables) on the compose resource:

| Variable | Required guidance |
|---|---|
| `POSTGRES_PASSWORD` | Strong generated database password. |
| `REDIS_PASSWORD` | Strong generated Redis password; compose injects it into `REDIS_URL`. |
| `JWT_SECRET` | Strong HMAC secret for compatibility with F1 smoke JWT generation. |
| `JWT_SIGNING_KEYS` | Preferred key-store JSON when using explicit signing keys; must align with `JWT_SECRET`/`JWT_KID` used by smoke credentials. |
| `RUNTIME_POSTGRES_PASSWORD` | Runtime-worker least-privilege database role password, distinct from `POSTGRES_PASSWORD`. |
| `LITELLM_MASTER_KEY` | LiteLLM master key used by API/runtime readiness and calls. |
| `INTERNAL_SECRET` | Canonical 32+ character internal/admin and inter-service secret shared by API, runtime-worker, scheduler-worker, and BullBoard. |
| `OPENAI_API_KEY` | Real provider key or a controlled fake key only when the F1 environment intentionally uses fake LLM mode. |
| `DATABASE_URL` | Runtime admin/API DSN using compose DNS, for example `postgresql://octo:<password>@postgres:5432/octo`; must not be a Build Variable. |
| `REDIS_URL` | Runtime Redis DSN using compose DNS, for example `redis://:<password>@redis:6379`; must not be a Build Variable. |
| `RUNTIME_DATABASE_URL` | Runtime-worker least-privilege DSN, for example `postgresql://octo_runtime:<runtime-password>@postgres:5432/octo`. |
| `LITELLM_BASE_URL` | `http://litellm:4000`; keep LiteLLM as an internal Compose service. |
| `LITELLM_HEALTH_ENDPOINT` | `/health/readiness`; do not replace readiness with liveness. |
| `LITELLM_HEALTH_TIMEOUT_MS` | `5000`; runtime env for API readiness. |
| `DASHBOARD_TOKEN` | Leave unset for the public F1 close surface so `/` and `/status` return HTTP 200 to smokes; set only for a deliberately private console and pass the matching `X-Dashboard-Token` in private checks. |
| `OCTO_WEB_CONSOLE_TOKEN` | Do not configure on the public web service for F1 console writes; graph reads/writes must use authenticated `octo_console_token` sessions, and secrets must never be exposed as `NEXT_PUBLIC_*`. |

Configure these non-secret metadata variables for F1 close deploys. They may be
Build Variables and must also be available to compose service runtime environments
through `docker-compose.yml`:

| Variable | Recommended F1 value | Notes |
|----------|----------------------|-------|
| `BUILD_PHASE` | `F1` | Required for `/api/health/version` to prove F1 closure. |
| `BUILD_VERSION` | release/tag value, for example `0.1.0-f1` | Must not be `unknown` in close-gate deploys. |
| `BUILD_COMMIT` | `${SOURCE_COMMIT}` when Coolify exposes it, otherwise the Git SHA | Must not be `unknown` in close-gate deploys. |
| `SOURCE_COMMIT` | Coolify-provided Git SHA when available | The Dockerfiles default `BUILD_COMMIT` from this value when explicit `BUILD_COMMIT` is absent. |
| `BUILD_TIME` | ISO-8601 UTC timestamp from the deployment | Must be a real UTC deployment timestamp for formal F1 close evidence. |

Local/public smoke examples:

```bash
curl -fsS https://agents.socialstudies.cloud/
curl -fsS https://agents.socialstudies.cloud/status
curl -fsS https://agents.socialstudies.cloud/api/health/live
curl -fsS https://agents.socialstudies.cloud/api/health/ready
curl -fsS https://agents.socialstudies.cloud/api/health/version
F1_WEB_URL=https://agents.socialstudies.cloud \
API_URL=https://agents.socialstudies.cloud/api \
bash scripts/f1-smoke.sh --health
```

Worker proof is not inferred from public API liveness. Validate
`runtime-worker`, `scheduler-worker`, `reclaimer-worker` and
`outbox-publisher-worker` through compose health, logs, worker heartbeats or
`pnpm f1:close-gate` in the Docker/Coolify environment.

## F1 Runtime Worker PostgreSQL role

For issue #266/F1 closeout, Coolify must configure a separate PostgreSQL credential for the `runtime-worker` service. `DATABASE_URL` remains the API/migration/admin DSN; `runtime-worker` uses `RUNTIME_DATABASE_URL`.

Add these as **Environment Variables** (not Build Variables):

| Variable | Example / guidance |
|---|---|
| `RUNTIME_POSTGRES_USER` | `octo_runtime` |
| `RUNTIME_POSTGRES_PASSWORD` | Strong generated secret, different from `POSTGRES_PASSWORD`. |
| `RUNTIME_DATABASE_URL` | `postgresql://${RUNTIME_POSTGRES_USER}:${RUNTIME_POSTGRES_PASSWORD}@postgres:5432/${POSTGRES_DB}` or the equivalent Coolify internal PostgreSQL host. |

Canonical Coolify flow: the `migrate` service receives `DATABASE_URL`, `RUNTIME_POSTGRES_USER` and `RUNTIME_POSTGRES_PASSWORD`. After schema migrations, `packages/database/src/migrate.ts` bootstraps/validates the runtime role and sets the password from the environment. The SQL migration remains secret-free; it only records the role/grant contract.

If migrations were run outside the Coolify compose `migrate` service, bootstrap the role manually once per database (safe to rerun and useful for password rotation):

```bash
DATABASE_URL=postgresql://octo:<admin-password>@postgres:5432/octo \
RUNTIME_POSTGRES_USER=octo_runtime \
RUNTIME_POSTGRES_PASSWORD=<runtime-password> \
bash scripts/bootstrap-runtime-db-role.sh
```

Then verify the production contract:

```bash
DATABASE_URL=postgresql://octo:<admin-password>@postgres:5432/octo \
RUNTIME_DATABASE_URL=postgresql://octo_runtime:<runtime-password>@postgres:5432/octo \
bash scripts/f1-runtime-db-role-smoke.sh --strict
```

The smoke fails if the runtime DSN is missing, if it reuses the API/migration username, if grants exist outside the F1 runtime table allowlist, if DDL succeeds, or if the role has `BYPASSRLS`/administrative attributes.

## Reproducibilidad, Hardening y Auditoría F1

### Reproducibilidad

- `docker-compose.yml` debe usar imágenes pinadas; LiteLLM está fijado como `ghcr.io/berriai/litellm:main-v1.61.7@sha256:0f7f39f40bf6ba4cc802b991ce8c4eb2fa41c8a25b821e1d2d5197229cad27fe`.
- PostgreSQL y Redis usan tags exactos de patch/Alpine (`postgres:16.6-alpine3.21`, `redis:7.4.2-alpine3.21`).
- El procedimiento de actualización controlada está en [`docker-versioning.md`](./docker-versioning.md); nunca reemplazar un digest por `latest`, `main-latest`, `edge`, `nightly`, `canary` o `dev`.

### Hardening

- Los Dockerfiles F1 ejecutan procesos finales con usuario no root.
- Los servicios long-running tienen `healthcheck` y `restart: unless-stopped`; `migrate` es el único one-shot con `restart: "no"`.
- `docker-compose.f1.yml` reduce blast radius con red explícita, volúmenes mínimos, `read_only`, `no-new-privileges`, `cap_drop: ALL` y `tmpfs` temporal para workers.

### Auditoría

Ejecuta antes de promover un deploy:

```bash
pnpm docker:verify-hardening
```

El comando falla el gate ante imágenes flotantes, runtime root, falta de health checks/restart policies críticas o secretos en Dockerfiles, y genera `artifacts/f1-hardening-report.md` como evidencia.
