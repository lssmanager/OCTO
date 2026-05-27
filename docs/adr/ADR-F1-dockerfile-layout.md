# ADR: F1 Dockerfile Layout

## Estado

Accepted

## Contexto

Había referencias mezcladas entre `apps/*/Dockerfile` y `docker/*.Dockerfile`, lo que generaba deriva entre compose, scripts y CI.

## Decisión

La convención oficial F1 es centralizar Dockerfiles en `/docker` y usar contexto de build `.` (root del repo).

| Servicio | Dockerfile |
|---|---|
| api | `docker/api.Dockerfile` |
| runtime-worker | `docker/runtime-worker.Dockerfile` |
| scheduler-worker | `docker/scheduler-worker.Dockerfile` |
| reclaimer-worker | `docker/reclaimer-worker.Dockerfile` |
| migrate | `docker/migrate.Dockerfile` |

## Consecuencias

- `docker-compose.yml` y `docker-compose.f1.yml` deben apuntar a `/docker/*.Dockerfile`.
- CI debe construir usando esos mismos paths.
- Las rutas `apps/*/Dockerfile` dejan de ser referencia operativa F1.
