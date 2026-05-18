# ADR-0017 — Execution State Machine Enforcement

**Status:** Accepted  
**Date:** 2026-05-18  
**Sprint:** F0→F1 Hardening (H5)

## Context

Without centralized state transition enforcement, any module can write
`db.update(executions).set({ status: 'completed' })` directly. This bypasses
FSM guards and allows impossible transitions (e.g., `completed → running`),
corrupting the execution timeline and making replay non-deterministic.

## Decision

**`packages/runtime-state` is the ONLY authority for execution status writes.**

All callers must use:
```typescript
await stateService.transition(tx, executionId, from, to, opts);
```

Direct Drizzle writes are blocked by ESLint rule `no-raw-execution-status-write`.

## FSM Diagram

```
pending ──────────────────────────────────────────────┐
  │                                                    │
  ▼                                                    │
queued ─────────────────────────────────────────── cancelled (terminal)
  │                                                    ▲
  ▼                                                    │
running ──┬─► waiting_tool ──┬─► running               │
          │                  └─► retrying ──────────────┤
          ├─► waiting_human ─┬─► running               │
          │                  └─► cancelled ─────────────┤
          ├─► retrying ──────┬─► queued                │
          │                  └─► running               │
          ├─► suspended ─────┬─► queued                │
          │                  └─► cancelled ─────────────┤
          ├─► completed (terminal)                      │
          ├─► failed    (terminal)                      │
          └─► cancelled ────────────────────────────────┘
```

## Enforcement Layers

1. **Runtime guard:** `assertValidTransition(from, to)` throws `InvalidTransitionError`
2. **ESLint rule:** `no-raw-execution-status-write` blocks at lint time
3. **Architecture test (planned F1):** `packages/runtime-state` import-only-from allowlist

## Replay Idempotency

If `from === to` (double-delivery of a BullMQ job), `transition()` is a no-op.
This prevents duplicate event appends on replay.

## Consequences

- All modules that previously wrote status directly must be refactored
- The FSM map is the single source of truth — adding new states requires ADR amendment
