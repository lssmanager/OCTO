# Language Strategy — TypeScript Control Plane + Python Runtime

**ADR:** F0-002  
**Status:** Accepted  
**Date:** 2026-05-17  
**Deciders:** Platform Team  

---

## Context

OCTO is a distributed multi-agent AI orchestration system. Two categories
of work must coexist in the same platform:

1. **Control work** — routing, scheduling, auth, state management, API
   serving, WebSocket, queue management, policy enforcement.
2. **Cognitive work** — LLM inference, tool execution, embeddings, vector
   search, RAG pipelines, browser automation, agent reasoning loops.

These two categories have *incompatible* optimal ecosystems:

| Dimension | Control Work | Cognitive Work |
|---|---|---|
| Ecosystem maturity | Node.js / TypeScript | Python |
| Primary frameworks | NestJS, BullMQ | FastAPI, LangGraph, CrewAI |
| Async model | Event loop (libuv) | asyncio (native) |
| ML tooling | Poor (LangChain.js lags) | Excellent (HuggingFace, vLLM, etc.) |
| Type safety | TypeScript strict | mypy strict + Pydantic v2 |
| Team familiarity | High | High |

---

## Decision

> **TypeScript is the System Nervous System. Python is the Cognitive Engine.**

The platform is split into two strictly isolated language domains:

### TypeScript — Control Plane

```
apps/api              NestJS — REST API, WebSocket, CQRS, BullMQ producers
apps/web              Next.js 14 — operational console
apps/channel-*        NestJS workers — channel adapters
packages/*            Shared TS libraries — contracts, database, queue, etc.
```

TypeScript version: **5.9.3** (F1 pin; owner: OCTO Repo Engineering; retire after TS 6.x is supported by ESLint/Vitest/workspace tooling and the lockfile gate is green)  
Node.js version: **>=22.13.0** (Node 22 baseline for pnpm 11.2.2; enforced by `engine-strict=true`)  
tsconfig: `strict: true` + `noUncheckedIndexedAccess: true` + `exactOptionalPropertyTypes: true`

### Python — Runtime (Execution Plane)

```
apps/runtime-worker   FastAPI — AI task execution, LLM calls, tool execution
apps/embedding-worker FastAPI — vector embedding pipeline  (F2)
apps/memory-worker    FastAPI — memory consolidation        (F2)
```

Python version: **3.12.x** (pinned via pyproject.toml `^3.12`)  
Package manager: **Poetry** (strict lockfile)  
Linter: **Ruff** (replaces flake8 + isort + black)  
Type checker: **mypy strict**  

---

## Rationale

### LangGraph — Python puro, sin compromiso

[LangGraph](https://github.com/langchain-ai/langgraph) maintains its
runtime as 100% Python. When they built `langgraph-api` (the server
layer), they chose FastAPI — not Express or NestJS — precisely to avoid
IPC overhead between the server and the runtime engine. OCTO follows
the same pattern: the runtime worker IS Python end-to-end.

### CrewAI — Pydantic contracts as the agent model

[CrewAI](https://github.com/crewAIInc/crewAI) defines agents as
Pydantic `BaseModel` instances with `role`, `goal`, `backstory`,
`max_iter` (recursion limit), and `max_rpm` (rate limiting). OCTO
adopts these exact fields in `IAgentProfile` (`@octo/contracts`) and
mirrors them as `ExecutionRequest` + `LLMConfigSchema` Pydantic models
in the runtime worker.

### AutoGen — GroupChat requires native Python async

[AutoGen](https://github.com/microsoft/autogen) is 100% Python. Its
`GroupChat` + `GroupChatManager` depend on native `asyncio` semantics
for turn-taking between agents. Implementing this correctly in Node.js
would be an anti-pattern that Microsoft itself avoided. OCTO will adopt
AutoGen-style multi-agent coordination in F3, which reinforces the
Python runtime decision.

### Semantic Kernel — Provider abstraction is language-agnostic

[Semantic Kernel](https://github.com/microsoft/semantic-kernel) exists
in C#, Python, and Java. Its key insight: the `Kernel` never calls
OpenAI directly — always through `IChatCompletionService`. OCTO
implements `ILLMProvider` in `@octo/sdk-abstractions` (TypeScript side)
and routes all LLM calls through the LiteLLM proxy (Python side),
following exactly this abstraction pattern.

### Anti-pattern avoided: AI runtime in Node

Rowboat (rowboatlabs/rowboat) attempted LangChain.js for the runtime:
- Embedding libraries 3× slower than Python equivalents
- APIs broken by version drift with the Python reference implementation
- No access to `browser-use`, `vLLM`, `sentence-transformers`, or
  serious ML tooling

**Node serves coordination. Python serves intelligence.**

---

## Boundary Rules (enforced in CI — F0-013)

| Rule | Enforcement |
|---|---|---|
| Zero `@nestjs/*` imports in `apps/runtime-worker` | `grep` in CI |
| Zero Python imports in `apps/api` or `apps/web` | `grep` in CI |
| `@octo/contracts` TS types mirror Python Pydantic schemas | JSON Schema test (F1) |
| Python files pass `ruff check` with zero warnings | CI step |
| Python files pass `mypy --strict` with zero errors | CI step |
| TypeScript files pass `tsc --noEmit` with zero errors | `turbo typecheck` |

---

## Communication Protocol (TypeScript ↔ Python)

```
Control Plane (TS)  ──HTTP POST /execute──►  Runtime Worker (Python)
                    ◄──ExecutionResult──────
                    ──GET /health/ready──►   (liveness / readiness probes)
                    ──GET /models──────►     (model availability)
                    ──BullMQ (Redis)────►    (async job dispatch, F2)
                    ◄──WebSocket────────     (streaming responses, F2)
```

Contracts are defined in TypeScript (`@octo/contracts`) and mirrored
manually as Pydantic models in `apps/runtime-worker/src/schemas.py`.
In F0 there is no auto-generation. A JSON Schema round-trip test will
validate that the two sides stay in sync starting in F1.

---

## Consequences

### Positive
- Full access to Python ML ecosystem (LangGraph, CrewAI, vLLM, HuggingFace)
- Native `asyncio` for agent coordination loops
- Strict type safety on both sides (TypeScript strict + mypy strict)
- Clear ownership boundary: Control = TS team, Runtime = Python team
- Independent deployment and scaling of control plane vs. runtime

### Negative / Mitigations
- **Two build systems** — mitigated by `turbo run build` covering both
  (turbo detects pyproject.toml and skips non-JS packages gracefully)
- **Contract drift risk** — mitigated by JSON Schema test in F1
- **IPC latency** — mitigated by BullMQ async dispatch + HTTP keep-alive;
  acceptable because LLM inference latency dwarfs IPC overhead

---

## References

- `F0-002-langgraph-runtime-contracts.md`
- `F0-008-crewai-agent-role-patterns.md`
- `F0-005-semantic-kernel-sdk-contracts.md`
- `F0-007-autogen-groupchat-patterns.md`
- [LangGraph](https://github.com/langchain-ai/langgraph)
- [CrewAI](https://github.com/crewAIInc/crewAI)
- [AutoGen](https://github.com/microsoft/autogen)
- [Semantic Kernel](https://github.com/microsoft/semantic-kernel)
