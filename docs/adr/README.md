# Architecture Decision Records

This directory contains all Architecture Decision Records (ADRs) for OCTO.

ADRs are the source of truth for architectural decisions, standards, and contracts.

---

## Index

### F0 — Foundation

| ADR | Title | Status |
|---|---|---|
| [F0-001](./F0-001-openclaw-patterns.md) | OpenClaw Patterns | Accepted |
| [F0-002](./F0-002-langgraph-runtime-contracts.md) | LangGraph Runtime Contracts | Accepted |
| [F0-003](./F0-003-n8n-infrastructure-patterns.md) | n8n Infrastructure Patterns | Accepted |
| [F0-004](./F0-004-flowise-monorepo-patterns.md) | Flowise Monorepo Patterns | Accepted |
| [F0-005](./F0-005-semantic-kernel-sdk-contracts.md) | Semantic Kernel SDK Contracts | Accepted |
| [F0-006](./F0-006-mcp-a2a-protocol-contracts.md) | MCP + A2A Protocol Contracts | Accepted |
| [F0-007](./F0-007-autogen-groupchat-patterns.md) | AutoGen GroupChat Patterns | Accepted |
| [F0-008](./F0-008-crewai-agent-role-patterns.md) | CrewAI Agent Role Patterns | Accepted |
| [F0-009](./F0-009-hermes-coordinator-patterns.md) | Hermes Coordinator Patterns | Accepted |
| [F0-010](./F0-010-paperclip-budget-governance-contracts.md) | Paperclip Budget Governance | Accepted |
| [F0-011](./F0-011-agency-agents-template-format.md) | Agency Agents Template Format | Accepted |
| [F0-012](./F0-012-monorepo-structure.md) | Monorepo Structure (Turborepo + pnpm) | Accepted |
| [F0-013](./F0-013-code-standards.md) | Code Standards (TS, ESLint, Prettier) | Accepted |
| [F0-014](./F0-014-dockerfile-coolify-strategy.md) | Dockerfile + Coolify Strategy | Accepted |
| [F0-015](./F0-015-observability-strategy.md) | Observability Strategy (OTEL) | Accepted |
| [F0-016](./F0-016-env-config-strategy.md) | Env Config Strategy | Accepted |

### Architecture Overview

| Document | Description |
|---|---|
| [OCTO-v5-arquitectura.md](../architecture/OCTO-v5-arquitectura.md) | Master architecture document — source of truth |

---

## ADR Format

```markdown
# ADR FXXX — Title

## Status

Accepted | Deprecated | Superseded by FXXX

## Context

Why this decision was needed.

## Decision

What was decided.

## Consequences

### Positive
### Negative
### Risks

## References
```

---

## Absolute Principles (Non-Negotiable)

See [OCTO-v5-arquitectura.md](../architecture/OCTO-v5-arquitectura.md) for the full list.

Core rules:
1. Control Plane never executes runtime AI tasks
2. Runtime workers are isolated processes
3. Every execution has `trace_id`, `execution_id`, `run_id`, `agent_id`
4. PostgreSQL is the system of record
5. No vendor SDK outside `packages/sdk-abstractions`
6. UI renders state — never controls execution
7. Agent hierarchy = delegation topology, not tenancy
