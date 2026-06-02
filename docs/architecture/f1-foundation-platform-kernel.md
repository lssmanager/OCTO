# F1 — Foundation Platform Kernel

## Decisión arquitectónica

F1 se define como la fase de fundación operacional verificable de OCTO.

F1 no cierra agentes completos, Agent Graph navegable ni ejecución real de tareas de agente. F1 cierra la base viva sobre la cual esas capacidades se construirán: servicios desplegados, conectados, observables y visibles desde una GUI mínima.

Esta definición resuelve la discrepancia entre el roadmap que trataba F1 como Agent Graph y la necesidad de cerrar primero una plataforma base verificable.

## Principio permanente de cierre de fases

Cada fase de OCTO debe cerrar con una GUI mínima verificable.

La GUI mínima debe cumplir estas reglas:

- mostrar solo la capacidad propia de la fase;
- no simular capacidades futuras;
- mostrar estados reales, no falsos verdes;
- diferenciar `online`, `connected`, `pending`, `not configured` y `offline`;
- permitir que un usuario vea si la fase vive sin leer logs ni consola;
- estar respaldada por backend, health checks y smoke test.

## F1: objetivo

F1 demuestra que OCTO vive como plataforma base:

- URL pública o ambiente accesible;
- dashboard mínimo de fundación;
- API online;
- PostgreSQL conectado;
- Redis conectado;
- LiteLLM visible como gateway;
- runtime-worker con health check;
- scheduler/reclaimer/outbox visibles como online, pending o not configured;
- Docker Compose deployable;
- variables requeridas validadas;
- logs visibles;
- smoke test mínimo.

## GUI mínima F1

La GUI de F1 es `Foundation Status Dashboard`.

```txt
OCTO FOUNDATION — F1

API                  Online
PostgreSQL           Connected
Redis                Connected
LiteLLM              Connected
Runtime Worker       Online
Scheduler Worker     Online / Pending
Reclaimer Worker     Online / Pending
Outbox Publisher     Online / Pending

Build Phase          F1
Environment          staging
Last Health Check    ok
```

## F1 no incluye

F1 no incluye:

- crear agentes desde GUI;
- Agent Graph navegable;
- crear relaciones jerárquicas;
- ejecución real de tareas de agente;
- tool calling durable;
- checkpoint/reclaim avanzado;
- timeline avanzado;
- flow editor;
- memoria semántica;
- canales externos;
- multi-agent orchestration.

## Secuencia canónica posterior

| Fase | Capacidad principal | GUI mínima de cierre |
|---|---|---|
| F1 | Foundation Platform Kernel | Dashboard de servicios base |
| F2 | Agent Registry & Hierarchy | Árbol/grafo mínimo Agency -> Agent |
| F3 | First Real Agent Execution | Crear agente simple y ejecutar una tarea básica |
| F4 | Durable Runtime | Timeline, checkpoints, reclaim y recovery visibles |
| F5 | Tools & Policies | Tool registry, permissions y approvals básicos |
| F6 | Channels | Estado y prueba mínima de canal conectado |
| F7 | Memory/RAG | Estado de Qdrant, embeddings y retrieval test |
| F8 | Planner/DAG | DAG mínimo visible y ejecutable |
| F9 | AI Operating System | Plataforma integrada completa |

## Implicación para roadmap

Las secciones del documento arquitectónico que describen F1 como `Agent Graph System` deben considerarse reemplazadas por esta definición.

Agent Graph pasa a F2, y la primera ejecución real de agente pasa a F3. El runtime durable completo, con checkpoints y reclaim avanzado, pasa a F4.

## Criterio de cierre

F1 se cierra cuando el usuario puede abrir la URL de fase y verificar visualmente que la fundación de OCTO está viva, conectada y observable.

No se debe cerrar F1 usando una demo prematura de agentes o ejecución si la fundación aún no es estable y visible.
