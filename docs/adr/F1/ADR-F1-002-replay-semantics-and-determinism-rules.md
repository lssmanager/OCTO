# ADR-F1-002 — Replay Semantics and Determinism Rules

**Status:** Accepted  
**Phase:** F1  
**Author:** OCTO Architecture  
**Date:** 2026-05-22  
**Supersedes:** ADR-F1-002 Proposed (2026-05-21)  
**Depends on:** [ADR-F1-001](./ADR-F1-001-durable-execution-semantics.md) Durable Execution Semantics  
**Issue:** [#95](https://github.com/lssmanager/OCTO/issues/95)

---

## Context

OCTO executions must be replayable for debugging, audit, recovery, and regression testing. A replayed execution must produce the same logical result as the original **without** triggering external side effects (LLM calls, tool calls, HTTP requests). The system must define exactly what constitutes a deterministic execution, what must be snapshotted to enable correct replay, and where replay fidelity cannot be guaranteed.

Replay in OCTO is a first-class runtime operation — not a debugging convenience. It is the mechanism used by crash recovery (reclaim from checkpoint), operator-initiated replay for audit, and automated regression testing against historical executions.

**Three replay models were evaluated:**

| Model | Description | Rejection Reason |
|---|---|---|
| Full re-execution from scratch | Re-run the execution from the original input | Triggers paid LLM and tool calls again; side effects may be destructive |
| Event sourcing replay without snapshots | Reconstruct state by replaying raw events | Unbounded cost for long executions; checkpoint writes already provide a better mechanism |
| Checkpoint-driven snapshot replay | Read from persisted state; never re-invoke external systems | **Selected** — deterministic, cost-safe, auditable |

**Reference implementations analyzed:** LangGraph (time-travel and checkpoint replay), CrewAI (task output reuse), n8n (execution rerun semantics), AutoGen (conversation history immutability), Semantic Kernel (cancellation boundaries), Flowise (execution history), AgentNeo/agent-lens (observability replay), Microsoft AI Agents for Beginners (evaluation loop, context engineering, metacognition).

---

## Decision

OCTO F1 defines replay as **checkpoint-driven, snapshot-based re-execution** that reads from persisted state and never re-invokes non-idempotent external systems.

---

## Replay Types

F1 defines three replay modes, each with distinct triggering conditions and guarantees:

| Type | Trigger | Reads from | Re-invokes LLM? | Re-invokes tools? |
|---|---|---|---|---|
| `recovery_replay` | Crash / lease expiry → reclaim | Last committed checkpoint | No | No (tool results from snapshot) |
| `operator_replay` | Explicit API call with `source=replay` | Any checkpoint by `checkpoint_id` | No | No unless `force_retrigger_side_effects=true` |
| `regression_replay` | CI / testing pipeline | Pinned checkpoint set | No | No |

All three types share the same determinism rules and snapshot contracts. They differ only in triggering authority and operator flags.

---

## Determinism Rules

### R-1: Message Ordering by Index

The sequence of messages passed to the LLM is reconstructed from `execution_checkpoint_writes` ordered by `(step_index ASC, write_index ASC)`. Timestamps play no role in logical ordering. Two executions of the same input with the same checkpoint lineage MUST produce the same `messages[]` sequence at every step boundary.

### R-2: Tool Results are Snapshotted Before Context Injection

A tool invocation's `result_json` is persisted as a `checkpoint_write` row **before** being appended to the message context. During replay, the stored result is used — the tool is never re-invoked. If `result_json` is absent from the checkpoint writes, the step is treated as uncommitted and re-executed from the preceding valid checkpoint (per ADR-F1-001 I-6).

### R-3: Non-Deterministic Tool Outputs Must Be Fully Snapshotted

Tools with `sideEffectLevel = 'low' | 'high'` MUST persist complete `result_json` in `execution_checkpoint_writes` to guarantee replay fidelity. If the result is not snapshotted, the step is not replayable and MUST be declared `replayable: false` in the tool definition. The `ToolRegistry` MUST surface this flag and the runtime MUST log a warning when a non-replayable tool executes during a replayed run.

### R-4: LLM Responses are Snapshotted Before Runtime Advances

The `assistant` message content and `tool_calls[]` returned by the model are stored in `state_json.messages` within the checkpoint **before** the runtime advances to the next step. During replay, the stored assistant message is used directly — no new LLM call is issued. The model name from `context_snapshot_json.modelPolicy.primaryModel` is the authoritative model for replay; the agent's current `modelPolicy` is ignored.

### R-5: Context Snapshot Immutability

At execution start, `context_snapshot_json` on the `executions` row captures: agent configuration, model policy, tool policy, budget policy, and effective hierarchy inheritance (Agency → Department → Workspace → Agent). Changes to the agent after execution start do not affect a running or replaying execution. A replay MUST load `context_snapshot_json` from the **original** execution row, not from the current live agent.

### R-6: Replay Execution Identity

A replay creates a new `executions` row with:
- `source = 'replay'`
- `original_execution_id` referencing the source execution
- `replay_from_checkpoint_id` referencing the starting checkpoint (null = replay from step 0)
- A fresh `execution_id` (UUIDv7)

A replay MUST NOT overwrite the original execution row. The original is immutable once in a terminal state.

### R-7: Channel Versions are Monotonically Non-Decreasing

`channel_versions` in `execution_checkpoints` MUST be monotonically non-decreasing across checkpoints ordered by `step_index ASC`. A checkpoint with a `channel_version` lower than a preceding checkpoint's version for the same channel constitutes a lineage integrity violation and MUST be rejected during replay load with error `CHANNEL_VERSION_REGRESSION`.

### R-8: Parent Checkpoint Chain is Linear and Acyclic

The `parent_checkpoint_id` chain for all checkpoints of a single execution run MUST be linear (no branching) and acyclic. A cycle or branch detected during lineage traversal constitutes `CHECKPOINT_LINEAGE_CORRUPTED` and transitions the execution to `FAILED`. Operator intervention is required.

---

## What Replay Does NOT Guarantee

| Limitation | Reason | Mitigation |
|---|---|---|
| Identical wall-clock timing | Replay reads from DB, not real-time | Timing is irrelevant for logical correctness |
| Identical token counts across model versions | Token encoding differs by model | Replay always uses model from `context_snapshot_json` |
| Full fidelity for `sideEffectLevel='high'` tools not snapshotted before failure | Tool ran but result was never persisted | Mark tool `replayable: false`; operator must decide whether to re-trigger |
| Replay of executions with missing intermediate checkpoints | Lineage broken | `CHECKPOINT_LINEAGE_BROKEN` (ADR-F1-001 I-5) |
| Budget re-evaluation with current prices | Replay uses snapshot budget policy | Operator can override with `force_budget_reevaluation=true` (F2+) |

---

## Cross-Reference Validation from Source Frameworks

### LangGraph (`langchain-ai/langgraph`) — Primary Reference

LangGraph's time-travel feature is the closest implementation reference. Its `get(config, checkpoint_id=...)` allows loading any historical checkpoint, and its replay semantics enforce that the graph re-runs from that checkpoint using stored state, not by re-invoking nodes.

| LangGraph Concept | OCTO Mapping | Validation |
|---|---|---|
| `checkpoint_id` parameter for time-travel | `replay_from_checkpoint_id` on replay execution row | ✅ Adopted |
| Graph re-runs from stored `state`, not re-invokes nodes | R-2: tool results from snapshot, R-4: LLM from snapshot | ✅ Identical |
| `channel_versions` monotonic non-decrease | R-7: `CHANNEL_VERSION_REGRESSION` error | ✅ Adopted |
| `parent_config` lineage is linear + acyclic | R-8: lineage integrity check | ✅ Adopted |
| Thread-level isolation for replay | `execution_id` scope; new row for each replay | ✅ Adopted |

### CrewAI (`crewaiinc/crewai`) — Task Output Reuse

CrewAI's `TaskOutput` objects are preserved and passed between tasks, validating that intermediate outputs must be durable and reusable.

| CrewAI Pattern | OCTO Validation |
|---|---|
| `TaskOutput` referenced by downstream tasks without re-execution | ✅ R-2: tool results snapshotted in checkpoint writes |
| `kickoff_async` produces same logical output regardless of re-run timing | ✅ R-1: message ordering by index, not timestamp |

### n8n (`n8n-io/n8n`) — Execution Rerun Semantics

n8n's "Retry execution" feature re-uses stored input data from the failed execution and reprocesses from that point.

| n8n Pattern | OCTO Validation |
|---|---|
| Retry from stored node input data | ✅ R-2 and R-4: snapshots used; external calls not repeated |
| Execution history immutable; retry creates separate record | ✅ R-6: replay creates new `executions` row, original immutable |
| `executionData` JSON preserved per execution | ✅ OCTO granular checkpoint model is a superset |

### Microsoft AutoGen (`microsoft/autogen`) — Conversation History

AutoGen's GroupChat preserves the complete `messages[]` history, which is essential for deterministic multi-turn replay.

| AutoGen Pattern | OCTO Validation |
|---|---|
| Full `messages[]` history required for any agent to resume context | ✅ ADR-F1-001 I-7: complete `messages[]` in every checkpoint |
| Ephemeral selection state must be reconstructible | ✅ R-1: ordering by index; no reliance on in-memory state |

### Semantic Kernel (`microsoft/semantic-kernel`) — Cancellation and Step Boundaries

SK's `CancellationToken` propagation validates that replay boundaries must align with step boundaries, not mid-instruction-pointer positions.

| SK Pattern | OCTO Validation |
|---|---|
| Cancellation checked before each function invocation | ✅ Replay reads checkpoint at step boundary; never resumes mid-LLM-call |
| `FunctionResult` is the unit of persistence between plan steps | ✅ R-2: tool result = checkpoint write at step boundary |

### Flowise (`flowiseai/flowise`) — Execution History Viewing

Flowise stores execution logs per node for debugging, validating the need for per-step timeline reconstruction without re-execution.

| Flowise Pattern | OCTO Validation |
|---|---|
| Node execution history stored per run | ✅ `execution_steps` + `execution_checkpoints` per step |
| Logs viewable without re-triggering the flow | ✅ Replay reads from DB; no external calls |

### AgentNeo / Agent-Lens — Observability Replay

AgentNeo and agent-lens validate that replay must be driven by structured trace/span data with deterministic reconstruction, not heuristic re-execution.

| Pattern | OCTO Validation |
|---|---|
| Span-level replay from stored trace data | ✅ `trace_id` + `execution_id` on every checkpoint enables span correlation |
| Tool call arguments and results captured per span | ✅ R-3: `result_json` in checkpoint writes |

### Microsoft AI Agents for Beginners — Context Engineering, Metacognition, Evaluation Loop

| Pattern | OCTO Validation |
|---|---|
| Context window management: what goes in, what stays out | ✅ R-5: immutable `context_snapshot_json` prevents context drift during replay |
| Metacognitive evaluation: agent inspects its own prior outputs | ✅ R-4: stored assistant messages enable inspection without re-calling LLM |
| Evaluation loop: collect → compare original vs. replay output | ✅ R-6: `original_execution_id` link enables direct diff of outputs |

---

## Enriched Invariants

### R-1 through R-8 (defined above in Determinism Rules)

### R-9: Replay Does Not Modify Original State

A replay run MUST NOT update any row in `executions`, `execution_steps`, `execution_checkpoints`, or `execution_checkpoint_writes` that belongs to the `original_execution_id`. The original timeline is append-only and immutable once in a terminal state.

### R-10: Replay Source Tracking in Outbox Events

All `outbox_events` emitted by a replay execution MUST include `"replay": true` and `"original_execution_id": "..."` in `payload_json`. Consumers that are sensitive to replay (e.g., billing, external notification, webhook delivery) MUST filter on this field and MUST NOT re-trigger production side effects for replay events.

### R-11: Schema Version Compatibility Check Before Replay

Before loading any checkpoint for replay, the runtime MUST read `metadata_json.checkpoint_schema_version` and validate it against the runtime's supported versions list. An unsupported schema version MUST fail with `CHECKPOINT_SCHEMA_INCOMPATIBLE` and reject the replay attempt. The runtime MUST NOT attempt blind deserialization of unsupported checkpoint schemas.

---

## Implementation Notes for F1 Engineers

### Replay Execution Bootstrap Pattern

```sql
-- Create replay execution record
INSERT INTO executions (
  id,
  tenant_id,
  agent_id,
  agent_version_id,
  state,
  version,
  input_json,
  source,
  original_execution_id,
  replay_from_checkpoint_id,
  context_snapshot_json,   -- copied from original executions row
  budget_snapshot_json,    -- copied from original executions row
  created_by
) VALUES (
  $new_execution_id,
  $tenant_id,
  $agent_id,
  $agent_version_id,
  'QUEUED',
  0,
  $original_input_json,
  'replay',
  $original_execution_id,
  $checkpoint_id_or_null,
  $original_context_snapshot_json,
  $original_budget_snapshot_json,
  $operator_user_id
);
```

### Checkpoint Load for Replay

```sql
-- Load checkpoint at replay_from_checkpoint_id (or latest if null)
SELECT ec.*, ecw.*
FROM execution_checkpoints ec
LEFT JOIN execution_checkpoint_writes ecw ON ecw.checkpoint_id = ec.id
WHERE ec.execution_id = $original_execution_id
  AND ($checkpoint_id IS NULL OR ec.id = $checkpoint_id)
ORDER BY ec.step_index DESC
LIMIT 1;

-- Validate channel_versions monotonicity
SELECT step_index, channel_versions
FROM execution_checkpoints
WHERE execution_id = $original_execution_id
ORDER BY step_index ASC;
-- Any channel whose version decreases -> CHANNEL_VERSION_REGRESSION
```

### Tool Replay Decision Tree

```text
tool_call detected during replay
  -> load tool definition from ToolRegistry
  -> if tool has checkpoint_write with result_json for this step
     -> use stored result (do NOT call tool)
  -> else if tool.replayable == false
     -> if force_retrigger_side_effects == true
        -> execute tool, persist result, continue
     -> else
        -> FAILED with TOOL_NOT_REPLAYABLE
  -> else (no stored result but tool is replayable)
     -> this is a partial replay from a failed step
     -> execute tool with idempotency_key, persist result, continue
```

### Replay Source Flag in Events

```typescript
// Every event emitted during a replay must carry the replay flag
const event: OctoEvent = {
  eventId: ulid(),
  eventType: 'ExecutionStepCompleted',
  tenantId,
  executionId: replayExecutionId,
  traceId,
  occurredAt: new Date().toISOString(),
  sequence: stepIndex,
  payload: {
    stepId,
    stepType,
    status: 'SUCCEEDED',
    replay: true,                          // R-10: replay flag
    originalExecutionId: originalExId,    // R-10: source tracking
  },
};
```

---

## Non-Goals (Confirmed for F1)

| Excluded Feature | Phase | Rationale |
|---|---|---|
| Time-travel UI (select checkpoint visually to replay from) | F2+ | Schema and API support exists in F1; UI affordance deferred |
| Divergent replay (replay with modified input or tools) | F2+ | F1 replay is read-only re-execution from original context |
| Replay branch management (multiple replay forks off same origin) | F2+ | F1 supports linear replay lineage only |
| Automated regression testing harness | F2+ | F1 lays the invariants; test harness is a separate system |
| Checkpoint pruning strategy | F2+ | Unbounded storage acceptable for F1 single-region scale |
| Budget re-evaluation at current prices during replay | F2+ | Snapshot budget is authoritative in F1 |

---

## Alternatives Considered

| Option | Rejected Reason |
|---|---|
| Re-run execution from scratch for replay | Triggers paid LLM and tool calls again; side effects may be destructive |
| Event sourcing replay without snapshots | Unbounded replay cost for long executions; checkpoint writes already provide a better mechanism |
| Partial replay without snapshotting tool results | Non-deterministic for tools with side effects; insufficient for audit |
| Time-travel via mutable checkpoint overwrites | Violates R-9: original state immutability; breaks audit trail |

---

## Exit Criteria Integration

For F1 to be declared **STABLE**, the following rules from this ADR must be tested and passing:

| Rule | Test Requirement |
|---|---|
| R-1 (Message ordering by index) | Replay produces identical `messages[]` sequence as original for same input |
| R-2 (Tool results from snapshot) | Replay with snapshotted tool results never calls the tool executor |
| R-3 (Non-deterministic tool flag) | `replayable: false` tool during replay without flag → `TOOL_NOT_REPLAYABLE` |
| R-4 (LLM from snapshot) | Replay does not issue any LiteLLM request; uses stored assistant messages |
| R-5 (Context snapshot immutability) | Modifying agent after execution start does not affect replay output |
| R-6 (Replay execution identity) | Replay creates new row; original row is unchanged post-replay |
| R-7 (Channel versions monotonic) | Corrupt `channel_versions` → `CHANNEL_VERSION_REGRESSION` on load |
| R-8 (Lineage acyclic) | Cyclic `parent_checkpoint_id` → `CHECKPOINT_LINEAGE_CORRUPTED` |
| R-9 (No mutation of original) | Replay writes zero rows to original execution's checkpoint tables |
| R-10 (Replay source tracking) | All events from replay carry `replay: true` and `original_execution_id` |
| R-11 (Schema version check) | Unsupported schema version → `CHECKPOINT_SCHEMA_INCOMPATIBLE`, no deserialization attempt |

---

## Related ADRs

| ADR | Relationship |
|---|---|
| [ADR-F1-001](./ADR-F1-001-durable-execution-semantics.md) Durable Execution Semantics | This ADR depends on ADR-F1-001 invariants I-5, I-6, I-7 |
| [ADR-F1-003](./ADR-F1-003-checkpoint-persistence-model.md) Checkpoint Persistence Model and Lineage Validation | Implements the physical storage required by R-1 through R-8 |
| [ADR-F1-005](./ADR-F1-005-tenant-isolation-rls.md) Tenant Isolation and RLS | `tenant_id` enforcement on replay execution rows |
| [ADR-F1-006](./ADR-F1-006-event-bus.md) Event Bus Split | R-10 replay flag consumed by event bus subscribers |

---

## References

- `docs/specs/F1-core-runtime-real-agent-execution.md §4.11 Determinism rules`
- `docs/specs/F1-core-runtime-real-agent-execution.md §15.4 Replay testing`
- `F0-002-langgraph-runtime-contracts.md §checkpoint-conformance`
- `OCTO-v5-arquitectura.md §Absolute Architectural Principles #4`
- [LangGraph time-travel and checkpoint replay](https://github.com/langchain-ai/langgraph)
- [CrewAI task output reuse](https://github.com/crewaiinc/crewai)
- [n8n execution rerun semantics](https://github.com/n8n-io/n8n)
- [Microsoft AutoGen conversation history](https://github.com/microsoft/autogen)
- [Semantic Kernel cancellation patterns](https://github.com/microsoft/semantic-kernel)
- [Flowise execution history](https://github.com/flowiseai/flowise)
- [Microsoft AI Agents — Context Engineering](https://microsoft.github.io/ai-agents-for-beginners/translations/es/12-context-engineering/)
- [Microsoft AI Agents — Metacognition](https://microsoft.github.io/ai-agents-for-beginners/translations/es/09-metacognition/)
- [Microsoft AI Agents — Production](https://microsoft.github.io/ai-agents-for-beginners/translations/es/10-ai-agents-production/)
