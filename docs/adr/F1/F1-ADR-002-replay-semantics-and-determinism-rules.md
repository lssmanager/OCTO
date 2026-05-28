# ADR-F1-002 — Replay Semantics and Determinism Rules

**Status:** Accepted
**Phase:** F1
**Author:** OCTO Architecture
**Date:** 2026-05-22
**Supersedes:** ADR-F1-002 (Proposed, 2026-05-21)
**Closes:** #95

---

## Context

OCTO executions must be replayable for debugging, audit, and crash recovery. A
replayed execution must produce the same logical result as the original without
triggering external side effects (LLM calls, tool calls, HTTP requests). The
system must define exactly what constitutes a deterministic execution, what must
be snapshotted to enable correct replay, and what the runtime MUST do (and MUST
NOT do) when it operates in replay mode.

This ADR was validated against the following reference implementations before
acceptance:

| Source | Relevant pattern |
|---|---|
| LangGraph (`langchain-ai/langgraph`) | `BaseCheckpointSaver`, `CheckpointTuple`, `putWrites`, time-travel replay |
| CrewAI (`crewaiinc/crewai`) | `TaskOutput` persistence, `kickoff_async`, non-deterministic tool classification |
| AutoGen (`microsoft/autogen`) | Full `messages[]` preservation across turns |
| Semantic Kernel (`microsoft/semantic-kernel`) | Cooperative cancellation, `FunctionChoiceBehavior` |
| n8n (`n8n-io/n8n`) | DB-as-record, full node output persistence, monorepo patterns |
| Paperclip (`paperclipai/paperclip`) | Immutable budget snapshot, pre-call budget evaluation |
| Hermes Chief of Staff | Hierarchical context compilation, policy inheritance |
| Microsoft AI Agents for Beginners (production) | Trace/span observability, evaluation loop, cost-per-call tracking |

---

## Decision

**OCTO F1 defines replay as checkpoint-driven, snapshot-based re-execution that
reads from persisted state and never re-invokes non-idempotent external
systems.**

A replay run reads its execution context, message history, LLM responses, and
tool results exclusively from the checkpoint store. It does not issue new
network requests to providers or tools, except when the operator explicitly sets
`force_retrigger_side_effects = true` for individual steps.

---

## Determinism Rules

### Rule 1 — Message ordering is deterministic by step and write index

The sequence of messages passed to any LLM call is reconstructed from
`execution_checkpoint_writes` ordered by `(step_index ASC, write_index ASC)`.
Timestamps play no role in logical ordering. An implementation that reorders
messages by timestamp violates this rule and produces undefined replay
behaviour.

### Rule 2 — Tool results are snapshotted in checkpoint writes before context
reinjection

A tool invocation's `result_json` MUST be persisted as a
`execution_checkpoint_writes` row before the result is appended to the
`messages[]` array and before the next LLM call is dispatched. During replay,
the stored result is used verbatim. The tool is never re-invoked in replay mode.

### Rule 3 — Non-deterministic tool outputs must be fully snapshotted

Tools with `sideEffectLevel = 'low' | 'high'` MUST persist the complete
`result_json` in `execution_checkpoint_writes`. If the result is not
snapshotted (e.g. the worker crashed before the write committed), the step is
not replayable. Such steps MUST be marked `replayable = false` in their tool
definition record, and the replay job MUST skip re-execution of those steps or
fail with `STEP_NOT_REPLAYABLE` depending on operator policy.

Tools with `sideEffectLevel = 'none'` and `retryable = true` may be
re-executed during replay if their snapshot is absent, because their output is
idempotent.

### Rule 4 — LLM responses are snapshotted in checkpoint state before advance

The `assistant` message content and `tool_calls[]` returned by the model are
stored in `state_json.messages` within the `execution_checkpoints` row **before
the runtime advances to the next step**. Replay uses the stored assistant
message, not a new LLM call. An execution that does not snapshot the assistant
message before advancing cannot be correctly replayed and MUST be marked
`fully_replayable = false` at the execution level.

### Rule 5 — Context snapshots are immutable for the lifetime of a run

At execution start, `context_snapshot_json` on the `executions` row captures:

- Agent configuration
- Resolved model policy (primary model + fallback chain)
- Tool policy (allow/deny lists)
- Budget policy
- Effective hierarchy level (Agency / Department / Workspace / Agent)

Changes to the agent after execution start do not affect a running, paused, or
replaying execution. A replay MUST use `context_snapshot_json` from the
original execution row, never the current live agent config or model policy.

---

## Replay Execution Model

### Replay run isolation

A replay creates a new `executions` row with:

```json
{
  "source": "replay",
  "original_execution_id": "<source execution id>",
  "replay_from_checkpoint_id": "<optional: start from specific checkpoint>",
  "replay_mode": "read_only | selective_retrigger",
  "force_retrigger_side_effects": false
}
```

A replay NEVER overwrites the original execution row or its checkpoints. The
original execution's timeline is read-only and immutable. If the replay
produces a different outcome, both outcomes are preserved in the audit record.

### Replay FSM

```
QUEUED_REPLAY
  -> LOADING_CHECKPOINT
  -> REPLAYING              (loop: read checkpoint → inject stored results → advance)
  -> SUCCEEDED_REPLAY
  -> FAILED_REPLAY
```

The replay FSM uses the same `execution_steps`, `execution_checkpoints`, and
`outbox_events` tables as a normal run, scoped to the new `execution_id`. The
`source = 'replay'` field distinguishes replay rows from live runs in all
dashboards, queries, and alerts.

### What replay does NOT guarantee

- Identical wall-clock timing
- Identical token counts if the model from the snapshot is deprecated
  (replay uses model from `context_snapshot_json`; if unavailable, fails
  with `REPLAY_MODEL_UNAVAILABLE`)
- Recovery of side effects from `sideEffectLevel = 'high'` tools that were not
  snapshotted before the original failure
- Behavioural parity if `state_json` schema version is higher than the current
  runtime supports (fails with `CHECKPOINT_SCHEMA_VERSION_UNSUPPORTED`)

---

## Invariants

### RI-1 — Context snapshot is source of truth for replay

A replay MUST use `context_snapshot_json` from the original execution row.
It MUST NOT read the current live agent config, model policy, or tool policy.
Violation produces non-deterministic replay and breaks the audit guarantee.

### RI-2 — Model is locked to snapshot

A replay MUST use the `model` field from `context_snapshot_json`, never the
agent's current `modelPolicy`. If the model is unavailable, the replay job
transitions to `FAILED_REPLAY` with code `REPLAY_MODEL_UNAVAILABLE`.

### RI-3 — High side-effect tools are blocked unless explicitly authorised

A replay MUST NOT invoke any tool with `sideEffectLevel = 'high'` without
explicit operator flag `force_retrigger_side_effects = true`. Attempting to
replay such a step without the flag produces `REPLAY_SIDE_EFFECT_BLOCKED` and
the replay fails.

### RI-4 — Checkpoint channel versions are monotonically non-decreasing

`channel_versions` across checkpoints in order of `step_index` MUST be
monotonically non-decreasing for every channel key. A checkpoint that reduces
any channel version is corrupt. On detection, the replay and any recovery job
MUST fail with `CHECKPOINT_VERSION_REGRESSION`.

### RI-5 — Checkpoint parent lineage is linear and acyclic

The `parent_checkpoint_id` chain for all checkpoints of a single execution run
MUST be linear (each checkpoint has exactly one parent, except step 0 which has
`null`) and acyclic. On reclaim or replay, the runtime MUST traverse this chain
back to step 0. A cycle or missing link produces
`CHECKPOINT_LINEAGE_BROKEN` and the job transitions to `FAILED` /
`FAILED_REPLAY`. Operator intervention is required.

### RI-6 — Replay execution_id is always distinct

A replay job MUST create a new `executions` row with a new UUIDv7
`execution_id`. Using the original `execution_id` for a replay job is a schema
violation and MUST be rejected by the API with `409 REPLAY_ID_COLLISION`.

---

## Sequence Diagram — Replay Load and Execute

```
Operator
  -> POST /v1/executions/:id/replay
       { replay_mode: "read_only" }

API
  -> validate JWT + execution ownership
  -> load original execution row
  -> validate context_snapshot_json present
  -> create new execution row (source=replay, original_execution_id=...)
  -> enqueue execution.dispatch (jobId = new_execution_id)

scheduler-worker
  -> CAS QUEUED_REPLAY -> LOADING_CHECKPOINT
  -> load latest checkpoint from original execution
  -> validate lineage (RI-5)
  -> validate channel_versions monotonic (RI-4)
  -> CAS LOADING_CHECKPOINT -> REPLAYING
  -> enqueue execution.dispatch (reason=replay)

runtime-worker (replay mode)
  -> for each step from step_index = 0:
       read state_json.messages from checkpoint
       if step has tool_call:
         read result_json from checkpoint_writes (never invoke tool)
         if result absent and sideEffectLevel=high: REPLAY_SIDE_EFFECT_BLOCKED
         if result absent and sideEffectLevel=none and retryable: re-execute tool
       if step has assistant message:
         inject from state_json.messages (never call LLM)
       advance step
       persist replay checkpoint + replay step
  -> CAS REPLAYING -> SUCCEEDED_REPLAY
```

---

## Cross-Reference Validation from Source Frameworks

### LangGraph (`langchain-ai/langgraph`)

LangGraph's `BaseCheckpointSaver.put_writes` stores intermediate channel
outputs (tool results, assistant turns) as pending writes, separate from the
main checkpoint snapshot. This maps directly to OCTO's
`execution_checkpoint_writes` table split.

During LangGraph's time-travel replay, the system reads from stored checkpoints
and does not re-execute graph nodes. OCTO adopts the same semantics for replay
mode: every step reads from persisted `checkpoint_writes`, never re-runs
external calls.

LangGraph's `checkpoint_id`-based time-travel (selecting an arbitrary past
checkpoint to resume from) is **infrastructure-ready in F1** (schema supports
`replay_from_checkpoint_id`) but the **UI affordance is deferred to F2+**.

### CrewAI (`crewaiinc/crewai`)

CrewAI's `TaskOutput` persistence pattern validates Rule 2: tool and task
outputs are stored as part of task state before the next task in the crew
receives them. CrewAI's memory types (short-term, long-term, entity, user) are
correctly excluded from F1 replay scope.

### AutoGen (`microsoft/autogen`)

AutoGen's `ConversableAgent` preserves the full `messages[]` history across
all turns. This validates Rule 4 and Invariant I-7 (from ADR-F1-001): the
`state_json` in every checkpoint MUST include the complete `messages[]` array
up to that step, not just the delta. Implementations that store only message
deltas cannot guarantee correct LLM context reconstruction during replay.

### Semantic Kernel (`microsoft/semantic-kernel`)

Semantic Kernel's cancellation model (cooperative, checked at step boundaries)
validates that replay correctly handles `CANCELLED` original executions:
a replay of a cancelled execution replays up to the cancellation point and
stops. The replay MUST NOT replay beyond the original terminal step.

SK's `FunctionChoiceBehavior` maps to OCTO's tool policy in `ToolRegistry`.
A replay respects the tool policy from `context_snapshot_json`, not the
current agent's live tool policy.

### n8n (`n8n-io/n8n`)

n8n's full node output persistence per execution (`resultData.runData`) is the
closest operational analog to OCTO's `execution_checkpoint_writes`. The key
difference: n8n stores a monolithic JSON blob per execution, while OCTO's
granular per-step-per-channel writes enable partial recovery and selective
replay, which is architecturally superior for long-running agentic workflows.

### Paperclip (`paperclipai/paperclip`)

Paperclip's immutable budget snapshot at session start validates Rule 5. A
replay uses the budget from `context_snapshot_json` but MUST NOT charge the
tenant's live budget for replay runs by default. Replay token costs are
tracked separately under `source = 'replay'` for accounting purposes.

### Hermes Chief of Staff

Hermes' hierarchical delegation pattern validates that a replay must reconstruct
the effective context from the hierarchy snapshot at execution start, not from
the current live hierarchy. If a department or workspace was restructured after
the original run, the replay still uses the snapshotted hierarchy.

### Microsoft AI Agents for Beginners (Production Patterns)

The "glass box" principle (agents with trace/span become auditable) validates
that replay is not just a recovery mechanism but a first-class audit tool.
Every replay run emits the same OTel spans and structured logs as a live run,
tagged with `replay = true`, enabling side-by-side comparison in Grafana
timelines.

---

## Storage Implications

| Concern | Impact | Mitigation |
|---|---|---|
| Checkpoint writes increase storage per execution | Proportional to context length and number of tool calls | Acceptable in F1 single-region; checkpoint pruning/TTL deferred to F2+ |
| Tool results may be large JSON objects | Write amplification on every tool step | `result_json` may be stored compressed (JSONB native compression in PG) |
| Executions with unsnapshotted non-deterministic tools | Partially replayable only | Marked `replayable = false` at step level; replay skips or fails depending on policy |
| Full `messages[]` in every checkpoint | Significant storage for long conversations | Deduplication or lazy-load optimization deferred to F2+; F1 stores complete arrays |

---

## Operator Replay API Contract

```http
POST /v1/executions/{executionId}/replay
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "replayFromCheckpointId": null,
  "replayMode": "read_only",
  "forceRetriggerSideEffects": false
}
```

**Response 202**
```json
{
  "replayExecutionId": "exe_replay_456",
  "originalExecutionId": "exe_123",
  "state": "QUEUED_REPLAY",
  "createdAt": "2026-05-22T21:00:00Z"
}
```

**Error codes**

| Code | HTTP | Condition |
|---|---|---|
| `EXECUTION_NOT_FOUND` | 404 | `executionId` not found or not visible to tenant |
| `REPLAY_NOT_ALLOWED_STATE` | 409 | Original execution is not in a terminal state |
| `REPLAY_ID_COLLISION` | 409 | Replay job already exists for this execution |
| `CHECKPOINT_LINEAGE_BROKEN` | 422 | Lineage validation fails on load |
| `REPLAY_MODEL_UNAVAILABLE` | 422 | Model from snapshot is no longer available |
| `REPLAY_SIDE_EFFECT_BLOCKED` | 422 | High side-effect step present and flag not set |

---

## Alternatives Considered

| Option | Rejected reason |
|---|---|
| Re-run execution from scratch for replay | Triggers paid LLM/tool calls again; side effects may be destructive; violates audit requirement |
| Event sourcing replay without snapshots | Unbounded replay cost for long executions; `checkpoint_writes` already exist and are cheaper to read |
| Partial replay without snapshotting tool results | Non-deterministic for tools with side effects; insufficient for audit; rejected by LangGraph and n8n reference patterns |
| Allow replay to use current live model policy | Breaks determinism guarantee; operator cannot trust audit replay if model has changed |

---

## Integration Test Requirements for F1 STABLE

These tests are **blocking for F1 STABLE** exit criteria:

| Test ID | Scenario | Expected outcome |
|---|---|---|
| IT-REPLAY-001 | Normal run completes → replay in `read_only` mode | `SUCCEEDED_REPLAY`, identical step sequence, zero external calls |
| IT-REPLAY-002 | Corrupt `parent_checkpoint_id` in lineage → replay | `FAILED_REPLAY` with `CHECKPOINT_LINEAGE_BROKEN` |
| IT-REPLAY-003 | High side-effect tool step present, `forceRetriggerSideEffects=false` | `FAILED_REPLAY` with `REPLAY_SIDE_EFFECT_BLOCKED` |
| IT-REPLAY-004 | Model from snapshot unavailable | `FAILED_REPLAY` with `REPLAY_MODEL_UNAVAILABLE` |
| IT-REPLAY-005 | `channel_versions` regression detected | `FAILED_REPLAY` with `CHECKPOINT_VERSION_REGRESSION` |
| IT-REPLAY-006 | Replay of cancelled execution | Replays to cancellation step, then `SUCCEEDED_REPLAY` at that boundary |
| IT-REPLAY-007 | Replay token cost does not debit live tenant budget | Replay cost tracked under `source=replay`, live budget unchanged |
| IT-REPLAY-008 | Two replay jobs on same original execution | Both create distinct `execution_id`s; no collision |

---

## Consequences

### Positive

- Execution timelines are fully auditable and reproducible
- Crash recovery reuses checkpoint snapshots, avoiding re-triggering paid API
  calls or destructive tool operations
- Determinism enables automated regression testing against historical executions
- Replay as first-class operation establishes the foundation for F2+ time-travel
  UI and evaluation loops

### Negative

- Checkpoint writes increase storage per execution proportionally to context
  length (mitigated by PostgreSQL JSONB native compression)
- Full `messages[]` in `state_json` means no differential storage for F1
  (deferred optimization)
- Executions with unsnapshotted non-deterministic tools cannot be fully replayed
  (operator must classify all tools correctly)

---

## Non-Goals (Confirmed for F1)

| Excluded feature | Phase | Rationale |
|---|---|---|
| Time-travel UI (select arbitrary checkpoint) | F2+ | Schema supports it; UI affordance deferred |
| Checkpoint pruning / TTL | F2+ | Unbounded growth acceptable in F1 single-region |
| Differential `messages[]` storage | F2+ | Full array required for F1 determinism guarantee |
| Checkpoint encryption at rest | F2+ | RLS + access control sufficient for F1 |
| Multi-agent replay coordination | F2+ | F1 handles single-agent only |

---

## Related ADRs

| ADR | Relationship |
|---|---|
| [ADR-F1-001 — Durable Execution Semantics](./F1-ADR-001-durable-execution-semantics.md) | This ADR depends on checkpoint model and CAS semantics defined there |
| ADR-F1-003 — Checkpoint Persistence Model and Lineage Validation | Implements the checkpoint schema and lineage validation that this ADR requires |
| ADR-F1-005 — Tenant Isolation and RLS | `tenant_id` enforcement applies to replay executions and their checkpoints identically |

---

## References

- `docs/phases/F1.md §4.11 Determinism rules`
- `docs/phases/F1.md §15.4 Replay testing`
- `F0-002-langgraph-runtime-contracts.md §checkpoint-conformance`
- `docs/OCTO-v5-arquitectura.md §Absolute Architectural Principles #4`
- LangGraph `BaseCheckpointSaver` — `langchain-ai/langgraph`
- CrewAI task lifecycle — `crewaiinc/crewai`
- AutoGen conversation history — `microsoft/autogen`
- n8n execution persistence — `n8n-io/n8n`
- Paperclip budget governance — `paperclipai/paperclip`
- Microsoft AI Agents for Beginners, production patterns
