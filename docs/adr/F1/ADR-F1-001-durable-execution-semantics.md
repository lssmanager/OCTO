# ADR-F1-001 — Durable Execution Semantics

**Status:** Accepted  
**Phase:** F1  
**Author:** OCTO Architecture  
**Date:** 2026-05-22  
**Supersedes:** ADR-F1-001 Proposed (2026-05-21)  
**Issue:** [#94](https://github.com/lssmanager/OCTO/issues/94)

---

## Context

OCTO executes long-running agentic workflows that span multiple LLM calls, tool invocations, approval gates, and external integrations. Executions must survive worker crashes, container restarts, deployments, and Redis restarts without losing state or producing duplicate side effects. The system must also support pause, resume, cancel, and replay as first-class operations.

**Three alternative models were evaluated:**

| Model | Description | Rejection Reason |
|---|---|---|
| In-memory execution | State lives in the worker process only | Does not survive worker restart; no recovery path |
| Event sourcing only | State reconstructed by replaying all events | Replay cost unbounded for long executions; complex read models |
| Checkpoint-based durable execution | State snapshots persisted to PostgreSQL at each step boundary | **Selected** — balances durability, performance, and recoverability |

**Reference implementations analyzed:** LangGraph (checkpoint model), CrewAI (task lifecycle), n8n (CAS + DB-as-record), AutoGen (conversation history), Semantic Kernel (cancellation patterns), Paperclip (budget governance), Hermes (hierarchical delegation), Microsoft AI Agents for Beginners (observability + production patterns).

---

## Decision

OCTO F1 adopts **checkpoint-based durable execution** as the canonical runtime model.

### Core Principles

1. **PostgreSQL is the sole system of record** for execution state, steps, checkpoints, and events. Redis is coordination infrastructure only (queues, leases, caches) and carries no durability guarantees for execution state.

2. **CAS-governed transitions** — Execution state transitions are governed by Compare-And-Swap on `(id, state, version)`. No transition is accepted without matching `expected_state` and `expected_version`. This prevents concurrent workers from producing inconsistent state.

3. **Step-boundary persistence** — Every meaningful runtime step produces a persisted row in `execution_steps` and an `execution_checkpoints` entry **before** the runtime advances. A step that did not commit is considered not-executed for recovery purposes.

4. **At-least-once queue, effectively-once DB** — At-least-once execution at queue level is accepted; effectively-once state transition at DB level is enforced via CAS and idempotency keys. External side-effect operations (tool calls, HTTP calls) must use idempotency keys and be classified by `sideEffectLevel`.

5. **Checkpoint as recovery unit** — The unit of recovery is the last committed checkpoint, not the last line of code executed. Workers that crash without committing their current step will have that step re-executed on reclaim.

6. **Durable pause/resume** — Pause and resume are durable states. A `PAUSED` execution is not a suspended process — it is a state in the DB awaiting a durable resume signal. The original worker process has no role after `PAUSED` is committed.

---

## Cross-Reference Validation from Source Frameworks

### LangGraph (`langchain-ai/langgraph`)

LangGraph's checkpoint model is the closest reference implementation. Its `BaseCheckpointSaver` defines the canonical `put/get/list/putWrites` API, and its `CheckpointTuple` (checkpoint + metadata + pending_writes + parent_config) maps directly to OCTO's `execution_checkpoints` + `execution_checkpoint_writes` schema split.

| LangGraph Concept | OCTO Mapping | Validation |
|---|---|---|
| Step boundary commit before graph node advance | `execution_steps` + `execution_checkpoints` committed before next step | ✅ Identical |
| Pending writes separate from checkpoint snapshot | `execution_checkpoint_writes` table | ✅ Enables partial recovery |
| Thread-level isolation (`thread_id`) | `execution_id` scope for checkpoint lineage | ✅ Adopted |
| Time-travel replay by `checkpoint_id` | Preserved for Ops replay workflows in F2+ | ⚠️ Deferred, schema supports it |

### CrewAI (`crewaiinc/crewai`)

CrewAI's Task lifecycle (`PENDING → IN_PROGRESS → COMPLETED/FAILED`) validates OCTO's FSM model.

| CrewAI Pattern | OCTO Validation |
|---|---|
| `TaskOutput` persistence referenced by subsequent tasks | ✅ OCTO checkpoint state propagation |
| `kickoff_async` for long-running workflows | ✅ Async durable execution confirmed correct |
| Memory types (short-term, long-term, entity, user) | ✅ Correctly excluded from F1 |

### n8n (`n8n-io/n8n`)

n8n provides the strongest operational reference for CAS + DB-as-record.

| n8n Pattern | OCTO Validation |
|---|---|
| Full node output persistence per execution | ✅ `execution_steps` + `execution_checkpoints` |
| Monolithic `executionData` JSON blob | ✅ OCTO granular checkpoint model is superior for partial recovery |
| Separate main + worker processes | ✅ Control Plane / Execution Plane separation validated |

### Microsoft AutoGen (`microsoft/autogen`)

AutoGen validates the multi-message checkpoint requirement.

| AutoGen Gap | OCTO Solution |
|---|---|
| Full `messages[]` history preservation | ✅ `state_json` must include complete message history |
| Ephemeral speaker selection and group state | ✅ OCTO makes conversation state durable via checkpoints |

### Semantic Kernel (`microsoft/semantic-kernel`)

| SK Pattern | OCTO Validation |
|---|---|
| `CancellationToken` propagation at step boundaries | ✅ Cooperative cancellation checked before each invocation, not mid-execution |
| `FunctionChoiceBehavior` (Auto/Required/None) | ✅ Maps to OCTO tool policy enforcement in `ToolRegistry` |

### Paperclip (`paperclipai/paperclip`)

| Paperclip Pattern | OCTO Validation |
|---|---|
| Budget evaluated before each LLM call | ✅ Runtime loop must check before dispatch, not just at start |
| Immutable budget snapshot at execution start | ✅ `budget_snapshot_json` prevents policy drift mid-run |

### Hermes Chief of Staff (`TheCraigHewitt/hermes-chief-of-staff`)

Validates that OCTO's `Agency → Department → Workspace → Agent → SubAgent` hierarchy has operational consequences for context compilation and policy inheritance during execution.

### Microsoft AI Agents for Beginners — Production Patterns

| Pattern | OCTO Validation |
|---|---|
| Agents with trace/span become "glass boxes" | ✅ Mandatory `trace_id` + `execution_id` + `agent_id` + `tenant_id` on every checkpoint and event |
| Evaluation loop (offline → deploy → monitor → collect → improve) | ✅ Replay as first-class operation in F1 |
| Cost management (routing, caching, per-call tracking) | ✅ `estimated_cost_usd` per step in `execution_steps` |

---

## Invariants

### I-1: Step Commitment
A step is considered **committed** if and only if its `execution_checkpoints` row exists with a valid `parent_checkpoint_id` chain back to step 0.

### I-2: CAS Abort on Conflict
A worker that loses CAS on a transition must **abort locally** and release its lease. It MUST NOT retry the CAS in a loop.

### I-3: Redis Never Primary
No execution state is ever read from Redis as primary source; Redis values are only used for queue coordination and short-lived coordination signals.

### I-4: Terminal State Immutability
An execution in a terminal state (`SUCCEEDED`, `FAILED`, `CANCELLED`, `TIMED_OUT`, `DLQ`) never transitions to a non-terminal state without explicit operator intervention.

### I-5: Checkpoint Lineage Validation *(from LangGraph)*
On reclaim, the `runtime-worker` MUST validate the checkpoint lineage from the loaded checkpoint back to step 0 by traversing `parent_checkpoint_id` links. A lineage break — null parent where non-null is expected, or a missing intermediate checkpoint row — constitutes a `CHECKPOINT_LINEAGE_BROKEN` failure and transitions the execution to `FAILED` with that error code. Operator intervention is required.

### I-6: Pending Writes Atomicity *(from LangGraph `putWrites`)*
`execution_checkpoint_writes` rows for a given `checkpoint_id` are committed in the **same transaction** as the checkpoint row itself. Partial writes (checkpoint row exists without its write rows) are treated as uncommitted for recovery purposes. The runtime MUST query both tables in the same consistent read when loading a checkpoint for resume.

### I-7: Message History in State *(from AutoGen)*
The `state_json` field of every `execution_checkpoints` row MUST include the **complete `messages[]` array** up to that step, in order. This ensures that resume and replay can reconstruct exact LLM context without re-executing prior turns. Implementations MUST NOT store only the delta from the previous checkpoint.

### I-8: Budget Pre-Check *(from Paperclip)*
The runtime MUST evaluate the effective budget policy against cumulative spend **BEFORE** dispatching each LLM call. A run that has exhausted its budget transitions to `PAUSED` (if override approval is configured) or `FAILED` with code `BUDGET_EXCEEDED`. Budget evaluation uses `budget_snapshot_json` captured at execution start — live policy changes do not affect in-flight executions.

---

## Consequences

### Positive

- Execution correctness is independent of worker lifecycle
- Recovery is automatic and requires no operator intervention in the common case
- Execution timelines are fully reconstructable from DB
- Supports replay, audit, and debugging without re-running production jobs
- Idempotency model prevents duplicate side effects on reclaim

### Negative

| Negative | Mitigation |
|---|---|
| Every step requires a DB write, adding latency per step | Acceptable for F1 scale (50 concurrent executions); batching considered for F2+ |
| Checkpoint JSON must remain schema-compatible across deployments | `checkpoint_schema_version` field required in `metadata_json`; runtime validates on load |
| Tool side-effect classification is a manual responsibility of tool authors | `sideEffectLevel: 'none' \| 'low' \| 'high'` enforced by `ToolRegistry` |
| Recovery from corrupt checkpoint lineage requires operator intervention | I-5 defines detection; operator playbook required for F1 STABLE |

### New Consequence — Schema Versioning Required

`state_json` and `metadata_json` schemas in checkpoints must be **versioned**. A `checkpoint_schema_version` field (integer, starting at `1`) MUST be present in `metadata_json`. The runtime MUST validate schema version on load and reject checkpoints with unsupported versions rather than attempting blind deserialization.

---

## Implementation Notes for F1 Engineers

### Checkpoint Write Pattern

```sql
BEGIN TRANSACTION;
  INSERT INTO execution_steps (id, execution_id, step_index, step_type, status, ...);
  INSERT INTO execution_checkpoints (
    id, execution_id, step_index, source, state_json,
    channel_versions, parent_checkpoint_id, metadata_json, ...
  );
  INSERT INTO execution_checkpoint_writes (
    id, tenant_id, checkpoint_id, task_id,
    write_index, channel, value_json, ...
  );
  INSERT INTO outbox_events (
    id, tenant_id, aggregate_type, aggregate_id, event_type,
    sequence, payload_json, ...
  );
  UPDATE executions
    SET version = version + 1, updated_at = now()
    WHERE id = $id
      AND tenant_id = $tenant_id
      AND state = $expected_state
      AND version = $expected_version; -- CAS guard
COMMIT;

-- Only after COMMIT: advance to next step
```

**CAS failure handling:** If `UPDATE executions` returns `rowcount = 0`, the entire transaction is a no-op. The worker MUST abort locally, log `cas_conflict=true`, and release its lease. It MUST NOT retry the CAS in a loop.

### Recovery Load Pattern

```sql
-- Load latest checkpoint with its pending writes in one consistent read
SELECT ec.*, ecw.*
FROM execution_checkpoints ec
LEFT JOIN execution_checkpoint_writes ecw ON ecw.checkpoint_id = ec.id
WHERE ec.execution_id = $execution_id
ORDER BY ec.step_index DESC
LIMIT 1;

-- Then traverse parent_checkpoint_id to validate lineage up to step 0
-- Any missing checkpoint in the chain -> CHECKPOINT_LINEAGE_BROKEN
```

### Pause/Resume Contract

A `PAUSED` execution MUST have a corresponding `approvals` row (or equivalent resume-signal row) **before** the state transition is committed. The resume command MUST reference the `approval_id` or `resume_token` and validate its existence before executing CAS `PAUSED → RUNNING`. Resuming without a valid resume signal returns `403 INVALID_RESUME_TOKEN`.

---

## Non-Goals (Confirmed for F1)

| Excluded Feature | Phase | Rationale |
|---|---|---|
| Memory retrieval / RAG | F3+ | Checkpoint model solves execution durability; memory retrieval is a separate concern |
| Multi-agent checkpoint coordination | F2+ | F1 handles single-agent durable execution only |
| Time-travel UI (select checkpoint to replay from) | F2+ | Infrastructure laid in F1; UI affordance deferred |
| Checkpoint pruning / TTL | F2+ | Unbounded growth acceptable in F1 single-region; pruning is operational optimization |
| Checkpoint encryption at rest | F2+ | RLS + access control sufficient for F1; field-level encryption is future hardening |

---

## Exit Criteria Integration

For F1 to be declared **STABLE**, the following invariants from this ADR must be tested and passing:

| Invariant | Test Requirement |
|---|---|
| I-5 (Lineage validation) | Integration test: corrupt `parent_checkpoint_id` → execution transitions to `FAILED` with `CHECKPOINT_LINEAGE_BROKEN` |
| I-6 (Pending writes atomicity) | Integration test: simulate partial write → checkpoint treated as uncommitted on recovery |
| I-7 (Message history in state) | Schema validation: every checkpoint contains complete `messages[]` array |
| I-8 (Budget pre-check) | Integration test: budget exhaustion mid-run → `PAUSED` or `FAILED` with `BUDGET_EXCEEDED` |

---

## Related ADRs

| ADR | Relationship |
|---|---|
| [ADR-F1-002](./ADR-F1-002-replay-semantics.md) Replay Semantics and Determinism Rules | Depends on this ADR |
| [ADR-F1-003](./ADR-F1-003-checkpoint-persistence-model.md) Checkpoint Persistence Model and Lineage Validation | Implements this ADR |
| [ADR-F1-005](./ADR-F1-005-tenant-isolation-rls.md) Tenant Isolation and RLS | `tenant_id` enforcement across all checkpoint tables |

---

## References

- `docs/specs/F1-core-runtime-real-agent-execution.md §4 Runtime Execution Engine`
- `F0-002-langgraph-runtime-contracts.md`
- `OCTO-v5-arquitectura.md §Absolute Architectural Principles #4, #12, #13`
- [LangGraph checkpoint savers](https://github.com/langchain-ai/langgraph)
- [CrewAI task lifecycle](https://github.com/crewaiinc/crewai)
- [n8n execution persistence](https://github.com/n8n-io/n8n)
- [Microsoft AutoGen](https://github.com/microsoft/autogen)
- [Semantic Kernel cancellation](https://github.com/microsoft/semantic-kernel)
- [Paperclip budget governance](https://github.com/paperclipai/paperclip)
- [Hermes Chief of Staff](https://github.com/TheCraigHewitt/hermes-chief-of-staff)
- [Microsoft AI Agents for Beginners — Production](https://microsoft.github.io/ai-agents-for-beginners/translations/es/10-ai-agents-production/)
