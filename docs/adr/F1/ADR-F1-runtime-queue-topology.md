# ADR: F1 Runtime Queue Topology

## Estado

Accepted

## Contexto

F1 requiere una topología explícita de colas para dispatch, reclaim y replay.
La ausencia de una convención única produce colas fantasma, métricas falsas,
reprocesos ambiguos y debugging difícil.

## Decisión

F1 tiene una sola cola activa para ejecuciones listas para runtime:

| Cola | Estado | Productores | Consumidores | Semántica |
|---|---|---|---|---|
| `execution.dispatch` | activa | `api`, `scheduler-worker`, `reclaimer-worker` | `runtime-worker` | ejecución lista para runtime |

Las siguientes colas no son activas en F1:

| Cola | Estado | Motivo |
|---|---|---|
| `execution.reclaim` | reservada/no activa | F1 no separa scanner y processor de reclaim; reclaimer reencola en `execution.dispatch`. |
| `runtime.execute` | legacy/no activa | El runtime consume `execution.dispatch`. |
| `execution` | inválida para F1 | Nombre genérico ambiguo. |
| `octo-execution` | legacy/no F1 | No representa la topología F1 granular. |

## Ownership

| Componente | Produce | Consume | Responsabilidad |
|---|---|---|---|
| `api` | `execution.dispatch` | none | crea ejecución y publica dispatch inicial/manual replay |
| `scheduler-worker` | `execution.dispatch` | scheduler input | detecta ejecuciones programadas/vencidas y publica dispatch |
| `runtime-worker` | none | `execution.dispatch` | ejecuta runtime F1 durable |
| `reclaimer-worker` | `execution.dispatch` | scanner interno DB | detecta zombies, hace CAS reclaim y reencola replay |

## Reclaim/replay

El reclaim no ejecuta agentes directamente.

```txt
RUNNING + lease expirado
  -> reclaimer-worker detecta zombie
  -> casReclaim actualiza estado/attempt
  -> reclaimer-worker encola execution.dispatch con reason=reclaim_replay
  -> runtime-worker consume execution.dispatch
  -> runtime F1 reanuda desde checkpoint durable
```

## Métricas

Las métricas de colas deben reportar únicamente colas reales consultadas en BullMQ.

`execution.reclaim` puede aparecer solo como `not_active`, sin consultar otra cola
y sin reutilizar estadísticas de `execution.dispatch`.

## Reglas

* Código productivo debe importar `QUEUES.EXECUTION_DISPATCH`.
* No se permiten strings hardcodeados para colas activas.
* No se permite usar `execution`, `runtime.execute` ni `execution.reclaim` como cola productiva F1.
* Tests deben fallar si reaparece una cola genérica o una métrica con nombre falso.
