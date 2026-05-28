# F1 Runtime Execution Path

## Canonical Runtime Entrypoint

The only canonical HTTP execution submit endpoint in `apps/runtime-worker` is:

```txt
POST /api/v1/execute
```

This endpoint is registered in:

```txt
apps/runtime-worker/src/main.py
```

through:

```txt
src/routers/execute.py
```

## Runtime Flow

```txt
POST /api/v1/execute
  -> apps/runtime-worker/src/routers/execute.py
  -> apps/runtime-worker/src/services/executor.py
  -> apps/runtime-worker/src/f1_runtime.py::run_f1_execution
  -> apps/runtime-worker/src/schemas/execution.py::ExecutionResult
```

## Contract

The runtime Python contract for this endpoint is:

```txt
apps/runtime-worker/src/schemas/execution.py
```

The active models are:

- `ExecutionRequest`
- `ExecutionResult`
- `ExecutionStatus`

No legacy `ExecutionRequest` or `ExecutionResult` model may be exported from
another runtime-worker module.

## Legacy Components Removed

The following legacy runtime execution components are not part of F1:

```txt
apps/runtime-worker/src/routers/execution.py
apps/runtime-worker/src/execution/engine.py
apps/runtime-worker/src/schemas.py
```

They must not be imported, re-exported, or registered.

## Architectural Invariants

F1 execution follows ADR-F1-001:

- PostgreSQL is the system of record for execution state.
- Runtime progress is durable at step/checkpoint boundaries.
- Recovery resumes from the last committed checkpoint.
- Redis/BullMQ coordinates work but is not the source of durable execution state.

## Cross-Language Contracts

This document does not close TS/Python contract synchronization.

Cross-language contract generation, drift detection, shared fixtures, and CI
enforcement remain tracked separately in:

```txt
Issue #145 — Cerrar sincronización real TS/Python y retirar contratos paralelos legacy
```
