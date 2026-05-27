# ADR: F1 Runtime Queue Topology

## Estado

Accepted

## Contexto

F1 requiere una topología explícita de colas para separar dispatch de reclaim/recovery y evitar ambigüedad operativa entre componentes.

## Decisión

Colas oficiales:

| Cola | Productores | Consumidores | Semántica |
|---|---|---|---|
| `execution.dispatch` | `api`, `scheduler-worker`, `reclaimer-worker` (cuando decide replay/retry) | `runtime-worker` | ejecución lista para runtime |
| `execution.reclaim` | `reclaimer-worker` scanner, operaciones admin de reclaim/requeue | `reclaimer-worker` (pipeline de recuperación) | ejecución requiere decisión de recuperación |

`execution` (genérica) no es cola oficial F1.

## Ownership

- `api`: produce dispatch inicial; no consume colas.
- `scheduler-worker`: produce dispatch para ejecuciones vencidas/programadas; no ejecuta runtime.
- `runtime-worker`: consume `execution.dispatch` y ejecuta runtime F1.
- `reclaimer-worker`: owner de detección de stuck/zombies, decide reclaim/replay y publica jobs de recuperación.

## Reclaim/replay

El reclaim no ejecuta agentes directamente. El loop de reclaim detecta y encola intención de recuperación en `execution.reclaim`. Si corresponde replay/retry, el flujo de recovery debe publicar un nuevo dispatch en `execution.dispatch`.

## Consecuencias

- Productores/consumidores deben usar constantes centralizadas (`@octo/queue` `QUEUES.*`).
- No se permiten strings hardcodeados de nombres de cola en código productivo.
- Los tests deben fallar si reaparece `execution` como cola activa ambigua.
