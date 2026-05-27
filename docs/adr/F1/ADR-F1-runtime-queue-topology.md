# ADR: F1 Runtime Queue Topology

## Estado

Accepted

## Contexto

F1 requiere una topología explícita de colas para separar dispatch de reclaim/recovery y evitar ambigüedad operativa entre componentes.

## Decisión

Cola oficial operativa:

| Cola | Productores | Consumidores | Semántica |
|---|---|---|---|
| `execution.dispatch` | `api`, `scheduler-worker`, `reclaimer-worker` (retry/replay) | `runtime-worker` pipeline de ejecución | ejecución lista para runtime |

`execution.reclaim` queda reservada para una futura separación scanner/processor, pero **no es necesaria en F1 actual**.

`execution` (genérica) no es cola oficial F1.

## Ownership

- `api`: produce dispatch inicial/manual replay; no consume colas.
- `scheduler-worker`: produce dispatch para ejecuciones vencidas/programadas; no ejecuta runtime.
- `runtime-worker`: ejecuta runtime F1 desde dispatch pipeline.
- `reclaimer-worker`: owner de detección de stuck/zombies, decide reclaim/replay y publica `execution.dispatch`.

## Reclaim/replay

El reclaim no ejecuta agentes directamente. El loop de reclaim detecta y, cuando corresponde replay/retry, publica un nuevo dispatch en `execution.dispatch` con `reason=reclaim_replay`.

## Consecuencias

- Productores/consumidores deben usar constantes centralizadas (`@octo/queue` `QUEUES.*`).
- No se permiten strings hardcodeados de nombres de cola en código productivo.
- Los tests deben fallar si reaparece `execution` como cola activa ambigua.
