# OCTO — Distributed Cognitive Execution System

> **OCTO** is a self-hosted agent orchestration platform — a distributed execution runtime, a graph-based cognitive infrastructure, and an event-driven orchestration engine.

[![CI](https://github.com/lssmanager/OCTO/actions/workflows/ci.yml/badge.svg)](https://github.com/lssmanager/OCTO/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](./LICENSE)

---

## What OCTO Is

| ✅ OCTO IS | ❌ OCTO IS NOT |
|---|---|
| A Distributed Cognitive Execution System | A chatbot platform |
| A self-hosted agent orchestration runtime | A SaaS wrapper |
| A graph-based execution engine (DAG) | A monolithic AI backend |
| An event-driven orchestration engine | A low-code prompt tool |
| A durable, replayable, observable runtime | A demo-level AI tooling |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. PRESENTATION LAYER       Next.js · React RSC · Tailwind · shadcn │
├─────────────────────────────────────────────────────────────────────┤
│  2. CONTROL PLANE            NestJS · Modular · apps/api             │
├─────────────────────────────────────────────────────────────────────┤
│  3. ORCHESTRATION            BullMQ · Redis · apps/scheduler-worker  │
├─────────────────────────────────────────────────────────────────────┤
│  4. RUNTIME EXECUTION        FastAPI · Python · apps/runtime-worker  │
├─────────────────────────────────────────────────────────────────────┤
│  5. CHANNEL ISOLATION        Per-channel isolated workers            │
├─────────────────────────────────────────────────────────────────────┤
│  6. INFRASTRUCTURE           Docker · Coolify · Traefik              │
├─────────────────────────────────────────────────────────────────────┤
│  7. PROVIDER ABSTRACTION     LiteLLM · packages/sdk-abstractions      │
├─────────────────────────────────────────────────────────────────────┤
│  8. PERSISTENCE              PostgreSQL · Redis · Qdrant · MinIO     │
├─────────────────────────────────────────────────────────────────────┤
│  9. SECURITY                 Zero-trust · OWASP ASVS · SLSA          │
├─────────────────────────────────────────────────────────────────────┤
│ 10. OBSERVABILITY            OpenTelemetry · Prometheus · Grafana    │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Monorepo Structure

```
octo/
├── apps/
│   ├── web/                  # Next.js — Presentation Layer (F11)
│   ├── api/                  # NestJS — Control Plane ONLY (F1+)
│   ├── runtime-worker/       # FastAPI Python — AI Execution (F1)
│   ├── embedding-worker/     # Isolated embedding pipeline (F6)
│   ├── memory-worker/        # Isolated memory pipelines (F6)
│   ├── scheduler-worker/     # BullMQ scheduler (F1)
│   ├── channel-whatsapp-worker/   # Baileys — isolated (F8)
│   ├── channel-telegram-worker/   # grammY — isolated (F8)
│   └── channel-discord-worker/    # Discord.js — isolated (F8)
├── packages/
│   ├── contracts/            # Shared DTOs & types ONLY
│   ├── events/               # Event schemas (ExecutionStarted, etc.)
│   ├── queue/                # BullMQ abstractions
│   ├── sdk-abstractions/     # Provider Abstraction Layer (LiteLLM)
│   ├── database/             # Drizzle ORM + migrations
│   ├── security/             # Auth, crypto, policies
│   ├── observability/        # OpenTelemetry setup
│   ├── config/               # TS base configs, ESLint, Prettier
│   ├── agent-core/           # Hierarchy, graph, delegation, authority
│   ├── prompts/              # Prompt templates
│   └── ui/                   # Shared React components
├── infra/
│   ├── docker/               # Dockerfiles per service
│   ├── compose/              # docker-compose files
│   └── coolify/              # Coolify deployment manifests
├── docs/
│   ├── adr/                  # Architecture Decision Records
│   └── architecture/         # Architecture docs
├── scripts/                  # Dev/ops scripts
├── .github/
│   └── workflows/            # CI/CD pipelines
├── turbo.json
├── pnpm-workspace.yaml
├── package.json
├── .gitignore
├── .npmrc
└── .env.example
```

---

## Build Phases

| Phase | Name | Description |
|---|---|---|
| **F0** | Foundation | Monorepo, infra, contracts, tooling, CI/CD |
| **F1** | Platform Kernel | Run, RunStep, state machine, event bus, checkpointing |
| **F2** | Hierarchy System | Agency, Department, Workspace, Agent, policies |
| **F3** | Agent Intelligence | AgentProfile, context compiler, planning, HEARTBEAT |
| **F4** | Tool Runtime | ToolRegistry, MCP client/server, sandboxing |
| **F5** | Memory & RAG | Vector retrieval, episodic memory, knowledge graph |
| **F6** | Multi-Agent | Coordination, delegation, GroupChat patterns |
| **F7** | Flow Engine | DAG execution, visual flow editor, versioning |
| **F8** | Channels | WhatsApp, Telegram, Discord, Teams, WebChat |
| **F9** | Providers | LLM gateway, auth profiles, cost tracking |
| **F10** | Observability | Full OTEL stack, Grafana, Prometheus, Loki |
| **F11** | Experience | Enterprise UX, dashboards, inspectors |

---

## Technology Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js, React RSC, Tailwind, shadcn/ui |
| Control Plane | NestJS, TypeScript, BullMQ |
| Runtime | FastAPI, Python, Pydantic |
| LLM Gateway | LiteLLM |
| Database | PostgreSQL (Drizzle ORM) |
| Vector DB | Qdrant |
| Cache / Queue | Redis |
| Object Storage | MinIO |
| Observability | OpenTelemetry, Grafana, Prometheus, Loki |
| Deployment | Docker, Coolify, Traefik |
| Monorepo | Turborepo + pnpm workspaces |

---

## Getting Started

### Prerequisites

- Node.js ≥ 20 LTS
- pnpm ≥ 8
- Docker + Docker Compose
- Python ≥ 3.11 (for runtime-worker)

### Setup

```bash
# Clone the repo
git clone https://github.com/lssmanager/OCTO.git
cd OCTO

# Copy env
cp .env.example .env

# Edit .env and replace all placeholder secret values

# Install dependencies
pnpm install

# Start infrastructure
docker compose -f infra/compose/docker-compose.infra.yml up -d

# Dev mode (all apps)
pnpm dev
```

---


## OCTO F1 Architecture Status

Current F1 behavior (as implemented in this repository):

- Control plane owns agent/execution APIs, auth/policy and dispatch decisions.
- Runtime worker owns model/tool execution and **currently persists runtime progress directly to PostgreSQL** for durable execution and recovery.
- Scheduler worker owns due/scheduled dispatch orchestration.
- Reclaimer worker owns stuck/zombie detection and replay/retry decisions.

### Control Plane vs Execution Plane (F1)

| Responsibility | Control Plane | Execution Plane / Runtime |
|---|---:|---:|
| Agent CRUD/versioning | Yes | No |
| AuthN/AuthZ/API policy | Yes | No |
| Execution creation + dispatch | Yes | No |
| Model/tool loop execution | No | Yes |
| Runtime progress/checkpoint persistence | Shared durable store | Yes (current F1 writer) |
| Reclaim decisions | No | Reclaimer worker |

### F1 complete vs F1 closed

- **F1 complete**: durable execution kernel is functionally implemented and executable end-to-end on canonical F1 path.
- **F1 closed**: F1 complete **plus** operational consistency (queues, ops metrics, deployment paths, tests, and documentation all aligned).

For the F1 operational closure architecture baseline, see `docs/f1/architecture.md`.

---

## Architecture Decision Records

All architectural decisions are documented in [`docs/adr/`](./docs/adr/).

See [`docs/adr/README.md`](./docs/adr/README.md) for the full index.

---

## Absolute Architectural Principles

1. **Control Plane vs Execution Plane** — never mix orchestration with execution
2. **Runtime is isolated** — workers are restartable, stateless-ish, disposable
3. **Event-driven** — every state transition produces an event
4. **DAG-based execution** — stateful, resumable, replayable
5. **UI is a state projection layer** — no orchestration in frontend
6. **Agent hierarchy = delegation topology** — not tenancy
7. **Provider abstraction is mandatory** — never direct SDK coupling
8. **Memory is graph-structured** — not flat chat history
9. **Observability is first-class** — trace_id on every execution
10. **Governance is mandatory** — recursion limits, token budgets, approval gates

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for development workflow, PR conventions, and ADR process.

---

## License

MIT — see [LICENSE](./LICENSE)
