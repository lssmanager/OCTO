# OCTO Technology Stack

## Official Stack

| Layer | Technology | Package / App |
|---|---|---|
| **Frontend** | Next.js, React RSC, Tailwind, shadcn/ui | `apps/web` |
| **Control Plane** | NestJS, TypeScript | `apps/api` |
| **Runtime Execution** | FastAPI, Python, Pydantic | `apps/runtime-worker` |
| **Queue / Scheduler** | BullMQ, Redis | `apps/scheduler-worker` |
| **LLM Gateway** | LiteLLM | `packages/sdk-abstractions` |
| **ORM** | Drizzle ORM | `packages/database` |
| **Database** | PostgreSQL | `infra/` |
| **Vector DB** | Qdrant | `infra/` |
| **Cache** | Redis | `infra/` |
| **Object Storage** | MinIO | `infra/` |
| **Observability** | OpenTelemetry, Grafana, Prometheus, Loki | `packages/observability`, `infra/` |
| **Deployment** | Docker, Coolify, Traefik | `infra/` |
| **Monorepo** | Turborepo | root |
| **Package Manager** | pnpm workspaces | root |

## 10-Layer Architecture

```
1. Presentation     → apps/web
2. Control Plane    → apps/api
3. Orchestration    → apps/scheduler-worker
4. Runtime          → apps/runtime-worker
5. Channels         → apps/channel-*-worker
6. Infrastructure   → infra/
7. Provider Abstraction → packages/sdk-abstractions
8. Persistence      → packages/database
9. Security         → packages/security
10. Observability   → packages/observability
```
