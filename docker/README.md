# docker/ — Compose Infrastructure

## Estructura

| Archivo | Propósito |
|---------|----------|
| `compose.base.yml` | Red `openclawnet` y volúmenes con nombre. Base compartida por todos los compose files. |
| `compose.dev.yml` | Infraestructura completa para desarrollo local: Postgres + Redis split. |

Los Dockerfiles de cada servicio desplegable viven en `apps/*/Dockerfile`.
El `Dockerfile` raíz es una copia de `apps/api/Dockerfile` para Coolify
(Coolify requiere el Dockerfile en la raíz del repo porque su build context
es el repo root).

## Redis split — por qué dos instancias

Una sola instancia de Redis sirviendo tanto BullMQ como cache crea una
trade-off imposible:
- BullMQ necesita `appendonly yes` (AOF) para no perder jobs ante restart.
- Un cache LRU no necesita persistencia — escribirla desperdicia I/O.

La solución: dos instancias con configuraciones óptimas para cada uso.

| Instancia | Puerto | Uso | Persistencia | Evición |
|-----------|--------|-----|-------------|--------|
| `redis-queue` | 6380 | BullMQ jobs | AOF (`appendonly yes`, `everysec`) | Ninguna |
| `redis-cache` | 6381 | Cache transient | Ninguna | `allkeys-lru` 256mb |

## Uso local

```bash
# Levantar solo infraestructura (Postgres + ambos Redis)
docker compose -f docker/compose.dev.yml up -d

# Verificar que todo está healthy
docker compose -f docker/compose.dev.yml ps

# Detener sin borrar volúmenes
docker compose -f docker/compose.dev.yml stop

# Borrar todo (destructivo)
docker compose -f docker/compose.dev.yml down -v
```

## Variables de entorno para `.env.local`

```env
# Base de datos
DATABASE_URL=postgresql://octo:octo_dev@localhost:5432/octo

# Redis — queue (BullMQ)
REDIS_URL=redis://localhost:6380

# Redis — cache (cuando se implemente en F1+)
REDIS_CACHE_URL=redis://localhost:6381
```

## Source of truth de cada Dockerfile

```
apps/api/Dockerfile        ←  SOURCE OF TRUTH para la API
Dockerfile (raíz)          ←  Copia verbatim para Coolify
apps/runtime-worker/       ←  Self-contained (Python, contexto propio)
```

Si modificas `apps/api/Dockerfile`, copia los cambios al `Dockerfile` raíz.
En el futuro, un step de CI puede automatizar esta verificación.
