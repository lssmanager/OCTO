# F1 — Foundation Platform Kernel + Agent Graph System

## Decisión arquitectónica

F1 is the verified foundation of OCTO plus the OCTO v5 Agent Graph System. Earlier text in this repository treated Agent Graph as F2; that is superseded. The active F1 boundary now includes a visible, persisted and guarded `Agency → Department → Workspace → Agent` graph.

The graph inclusion is intentionally narrow: it covers hierarchy, minimum CRUD, effective policy/capability projection and honest operational state. It does not include real agent execution, runtime streaming or multi-agent runtime orchestration.

## Principio permanente de cierre de fases

Each phase must close with a minimal verifiable GUI. For F1, `/` is the **F1 Agent Graph Console** and `/status` remains the foundation status dashboard. Both must show real backend state and must not simulate future runtime behavior.

## F1 incluye

- deployable monorepo/Docker foundation;
- API, PostgreSQL, Redis and LiteLLM gateway visibility;
- workers/queues reported honestly as online, pending, not configured or offline;
- environment validation, logs and smoke checks;
- F1 Agent Graph CRUD and projection for `Agency → Department → Workspace → Agent`;
- backend JWT/RBAC/tenant/hierarchy guards for graph reads and writes;
- web-console writes through a server-side/session-aware route using an `API_URL` base with the global `/api` prefix, never through `NEXT_PUBLIC_*` write secrets.

## F1 no incluye

- real agent execution;
- streaming runtime responses;
- fabricated runtime online/offline projections;
- flow editor or visual DAG execution;
- SubAgent runtime orchestration;
- semantic memory/RAG;
- external channels.

## Secuencia canónica posterior

| Fase | Capacidad principal | GUI mínima de cierre |
|---|---|---|
| F1 | Foundation + Agent Graph System | Agent Graph Console + foundation status |
| F2 | Runtime execution boundary | First runtime projections/execution surface without relabeling Agent Graph |
| F3 | Streaming and richer execution UX | Streaming/timeline views backed by runtime events |
| F4+ | Durable runtime, tools, channels, memory and OS integration | Capability-specific consoles |

## Criterio de cierre

F1 closes when a user can verify foundation health and operate the guarded Agent Graph without browser-exposed write secrets, and when `pnpm f1:close-gate` validates the Agent Graph as F1.
