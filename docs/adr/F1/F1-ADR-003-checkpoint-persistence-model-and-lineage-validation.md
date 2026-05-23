# ADR-F1-003 — Checkpoint Persistence Model and Lineage Validation

**Status:** Accepted  
**Phase:** F1  
**Author:** OCTO Architecture  
**Date:** 2026-05-22  
**Supersedes:** ADR-F1-003 Proposed (2026-05-21)  
**Issue:** [#96](https://github.com/lssmanager/OCTO/issues/96)  

---

## Table of Contents

1. [Context](#1-context)
2. [Decision](#2-decision)
3. [Data Structures](#3-data-structures)
4. [Lineage Invariants](#4-lineage-invariants)
5. [Commit Protocol](#5-commit-protocol)
6. [Recovery Read Protocol](#6-recovery-read-protocol)
7. [Fork and Resume Operations](#7-fork-and-resume-operations)
8. [Pruning Strategy](#8-pruning-strategy)
9. [SQL DDL and Indexes](#9-sql-ddl-and-indexes)
10. [Drizzle ORM Schema](#10-drizzle-orm-schema)
11. [RLS Policies](#11-rls-policies)
12. [Python Implementation](#12-python-implementation)
13. [TypeScript CheckpointService Interface](#13-typescript-checkpointservice-interface)
14. [Cross-Reference: Source Frameworks](#14-cross-reference-source-frameworks)
15. [Enriched Invariants](#15-enriched-invariants)
16. [Alternatives Rejected](#16-alternatives-rejected)
17. [Consequences](#17-consequences)
18. [Non-Goals (Confirmed for F1)](#18-non-goals-confirmed-for-f1)
19. [Conformance Test Suite](#19-conformance-test-suite)
20. [Exit Criteria Integration](#20-exit-criteria-integration)
21. [Related ADRs](#21-related-adrs)

---

## 1. Context

OCTO F1 requires durable execution semantics (ADR-F1-001) grounded in a concrete persistence model. The
checkpoint model must support:

- Recovery from any committed step after worker crash
- Lineage traversal for corruption detection and correctness validation
- Replay for debugging, audit, and operator-driven re-execution
- Correctness validation without full table scans
- Multi-tenant isolation enforced at the database layer
- Integration with BullMQ-driven reclaim and PostgreSQL as the sole system of record

The model is derived from LangGraph's checkpoint contract and adapted for OCTO's PostgreSQL-first,
multi-tenant, BullMQ-driven architecture.

### Evaluated Alternatives

| Model | Description | Rejection Reason |
|---|---|---|
| Single-table monolithic JSON | All checkpoint state in one JSONB blob per execution row | No partial recovery; lineage traversal requires full blob parse; write amplification on every update replaces entire blob |
| Event-sourced checkpoint store | Checkpoints derived by replaying event stream on demand | Replay cost unbounded for long executions; JSONB event ordering complexity; pruning requires full stream reconstruction |
| **Two-table linked-list with pending writes** | **Snapshots + delta writes with parent pointers** | **Selected** — atomic commits, O(N) lineage traversal, schema evolution, partial recovery via parent fallback |

---

## 2. Decision

OCTO F1 uses a **linked-list checkpoint model** persisted in two tables:

- `execution_checkpoints` — full state snapshot per step
- `execution_checkpoint_writes` — pending writes delta per checkpoint

Both tables are scoped by `tenant_id` and protected by Row-Level Security (per ADR-F1-005).

This model is directly derived from LangGraph's `BaseCheckpointSaver` pattern, which stores checkpoints
at each superstep boundary and enables human-in-the-loop, memory between interactions, and time-travel
debugging. The two-table separation mirrors LangGraph's separation of `Checkpoint` snapshots from
`pending_writes`, ensuring that on node failure, successfully completed nodes within the same superstep
are not re-executed on resume.

---

## 3. Data Structures

### 3.1 execution_checkpoints

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `TEXT` | PRIMARY KEY | UUIDv7 — monotonic, sortable |
| `execution_id` | `TEXT` | NOT NULL, FK → executions.id | Parent execution |
| `tenant_id` | `TEXT` | NOT NULL, FK → tenants.id | RLS-enforced scope |
| `step_index` | `INTEGER` | NOT NULL | Strictly monotonic per execution |
| `source` | `TEXT` | NOT NULL | `input` \| `loop` \| `tool` \| `approval` \| `reclaim` \| `final` |
| `parent_checkpoint_id` | `TEXT` | NULLABLE, FK → execution_checkpoints.id | NULL only for `step_index = 0` |
| `state_json` | `JSONB` | NOT NULL | Full channel state including complete `messages[]` array |
| `channel_versions` | `JSONB` | NOT NULL DEFAULT `{}` | Map of channel name → version (LangGraph: `channel_versions`) |
| `versions_seen` | `JSONB` | NOT NULL DEFAULT `{}` | Map of task_id → channel → version (LangGraph: `versions_seen`) |
| `metadata_json` | `JSONB` | NOT NULL DEFAULT `{}` | Step metadata; MUST include `checkpoint_schema_version` |
| `created_at` | `TIMESTAMPTZ` | NOT NULL DEFAULT `now()` | Creation timestamp |

### 3.2 execution_checkpoint_writes

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | `TEXT` | PRIMARY KEY | UUIDv7 |
| `checkpoint_id` | `TEXT` | NOT NULL, FK → execution_checkpoints.id | Parent checkpoint |
| `tenant_id` | `TEXT` | NOT NULL | RLS-enforced scope |
| `task_id` | `TEXT` | NOT NULL | Which task/agent produced this write |
| `task_path` | `TEXT` | NOT NULL DEFAULT `''` | Hierarchical path; empty string for F1 single-agent |
| `write_index` | `INTEGER` | NOT NULL | Monotonic ordering within checkpoint |
| `channel` | `TEXT` | NOT NULL | Target channel name |
| `type` | `TEXT` | NOT NULL | `message` \| `tool_result` \| `state_update` |
| `value_json` | `JSONB` | NOT NULL | Write payload |

---

## 4. Lineage Invariants

These invariants are **enforced** — violations cause runtime failure, not warnings.

**I-L1:** Every checkpoint with `step_index > 0` MUST have a non-null `parent_checkpoint_id` pointing
to a committed checkpoint of the same `execution_id`.

**I-L2:** `step_index` MUST be strictly monotonically increasing across the parent chain. No two
checkpoints of the same execution may share a `step_index`.

**I-L3:** No two checkpoints of the same execution may share the same `(step_index, source)` pair.
Enforced by unique index `idx_checkpoints_exec_step_source`.

**I-L4:** Lineage traversal from any checkpoint back to `step_index = 0` via `parent_checkpoint_id`
links MUST complete in at most `max_steps` hops (default: 10,000). Cycles are prohibited and detected
by step counter overflow.

---

## 5. Commit Protocol

A step is considered **committed** only if the following five-statement transaction commits
successfully. Partial writes are impossible given transaction atomicity.

```sql
BEGIN;

-- 1. Insert checkpoint snapshot
INSERT INTO execution_checkpoints
  (id, execution_id, tenant_id, step_index, source,
   parent_checkpoint_id, state_json, channel_versions,
   versions_seen, metadata_json)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10);

-- 2. Insert pending writes (one row per write)
INSERT INTO execution_checkpoint_writes
  (id, checkpoint_id, tenant_id, task_id, task_path,
   write_index, channel, type, value_json)
VALUES
  ($11, $1, $3, $12, $13, 0, $14, $15, $16),
  ($17, $1, $3, $12, $13, 1, $18, $19, $20);
  -- ... repeat per write

-- 3. Insert execution step
INSERT INTO execution_steps
  (id, execution_id, tenant_id, step_index, step_type, status, started_at)
VALUES ($21, $2, $3, $4, 'CHECKPOINT', 'SUCCEEDED', now());

-- 4. Insert outbox event
INSERT INTO outbox_events
  (id, tenant_id, aggregate_type, aggregate_id, event_type, sequence, payload_json)
VALUES ($22, $3, 'execution', $2, 'ExecutionStepCheckpointed', $23, $24);

-- 5. CAS guard: increment execution version, confirm lease ownership
UPDATE executions
SET version = version + 1, updated_at = now()
WHERE id = $2
  AND tenant_id = $3
  AND version = $25      -- expected_version
  AND lease_owner = $26  -- current worker id
  AND state = 'RUNNING';
-- rowcount MUST be 1; if 0 → ROLLBACK + raise CASConflictError

COMMIT;
```

**CAS failure protocol:** If `UPDATE executions` returns `rowcount = 0`, the transaction MUST be rolled
back. The worker MUST raise `CASConflictError`, log `cas_conflict=true` with `execution_id`,
`expected_version`, `lease_owner`, and abort the current step. This indicates a concurrent reclaim or
stale worker and must not be silently ignored.

---

## 6. Recovery Read Protocol

### 6.1 Load latest valid checkpoint

```sql
-- Step 1: Fetch latest checkpoint for execution
SELECT ec.*
FROM execution_checkpoints ec
WHERE ec.execution_id = $1
  AND ec.tenant_id = $2
ORDER BY ec.step_index DESC
LIMIT 1;

-- Step 2: Load its pending writes
SELECT ecw.*
FROM execution_checkpoint_writes ecw
WHERE ecw.checkpoint_id = $checkpoint_id
  AND ecw.tenant_id = $2
ORDER BY ecw.write_index ASC;
```

### 6.2 Schema validation and fallback

After loading `state_json`:

1. Validate `checkpoint_schema_version` in `metadata_json`; reject if unsupported version.
2. Validate `state_json` against `ExecutionCheckpointState` JSON Schema.
3. Validate that `messages[]` is present and non-empty (for `source != 'input'`).
4. If validation fails: fall back to `parent_checkpoint_id`, repeat from step 1.
5. If `parent_checkpoint_id` is NULL and validation still fails: emit
   `CHECKPOINT_RECOVERY_FAILED`, transition execution to `FAILED`.

### 6.3 Lineage validation on reclaim

Before resuming from any checkpoint, the runtime MUST verify lineage completeness:

```
traverse parent_checkpoint_id chain from loaded checkpoint
  for each hop:
    if row is missing AND hops > 0 → CHECKPOINT_LINEAGE_BROKEN
    if hop_count > max_steps → CHECKPOINT_LINEAGE_BROKEN
  expected termination: row.parent_checkpoint_id IS NULL AND row.step_index = 0
```

A `CHECKPOINT_LINEAGE_BROKEN` result transitions the execution to `FAILED` and routes the BullMQ job
to DLQ. No automatic recovery without operator intervention.

---

## 7. Fork and Resume Operations

### 7.1 Resume

Resume is valid only from `PAUSED` state (approval gate or human-in-the-loop). Protocol:

1. `POST /v1/executions/{executionId}/resume` — validated, persisted approval resolution.
2. API enqueues `execution.resume` BullMQ job.
3. Scheduler does CAS `PAUSED → DISPATCHED`, assigns new lease.
4. Runtime worker loads latest checkpoint per §6.1, validates lineage per §6.3.
5. Creates `execution_step(type='RECLAIMED')`, CAS `DISPATCHED → RUNNING`.
6. Continues from `checkpoint.step_index + 1`.

### 7.2 Fork

Fork creates an independent execution branch from a historical checkpoint without affecting the source
execution. Inspired by CrewAI's `Crew.fork(config, branch="...")` for safe experimentation.

**Request:** `POST /v1/executions/{sourceExecutionId}/fork`
```json
{
  "checkpointId": "chk_abc",
  "label": "debug-branch-01"
}
```

**Behavior:**
- Creates a new `executions` row with `parent_execution_id = sourceExecutionId` and
  `fork_checkpoint_id = checkpointId`.
- New execution starts from the specified checkpoint's `step_index + 1`.
- Fork checkpoints get a new lineage root (`step_index = 0` from fork point) with
  `state_json` copied from the fork checkpoint.
- The source execution is never modified.
- Fork executions are independent and accrue their own costs against tenant budget.

---

## 8. Pruning Strategy

Checkpoints are retained for `CHECKPOINT_RETENTION_DAYS` (default: 30).

**Pruning never deletes:**
- `step_index = 0` checkpoints (input snapshots)
- `source = 'final'` checkpoints of `SUCCEEDED` executions
- Any checkpoint referenced by an active (non-resolved) approval
- Any checkpoint that is `parent_checkpoint_id` of a checkpoint outside the pruning window

Pruning runs as a background job, never in the hot path of the runtime.

```sql
-- Pruning job: daily scheduled task
-- Step 1: delete writes for prunable checkpoints
DELETE FROM execution_checkpoint_writes
WHERE checkpoint_id IN (
  SELECT ec.id
  FROM execution_checkpoints ec
  LEFT JOIN approvals a ON a.checkpoint_id = ec.id
  LEFT JOIN execution_checkpoints child ON child.parent_checkpoint_id = ec.id
    AND child.created_at >= now() - interval '30 days'
  WHERE ec.created_at < now() - interval '30 days'
    AND a.id IS NULL          -- not referenced by any approval
    AND child.id IS NULL      -- not a parent of a recent checkpoint
    AND ec.source NOT IN ('input', 'final')
    AND ec.step_index > 0
);

-- Step 2: delete prunable checkpoint rows
DELETE FROM execution_checkpoints
WHERE id IN (
  SELECT ec.id
  FROM execution_checkpoints ec
  LEFT JOIN approvals a ON a.checkpoint_id = ec.id
  LEFT JOIN execution_checkpoint_writes ecw ON ecw.checkpoint_id = ec.id
  LEFT JOIN execution_checkpoints child ON child.parent_checkpoint_id = ec.id
    AND child.created_at >= now() - interval '30 days'
  WHERE ec.created_at < now() - interval '30 days'
    AND a.id IS NULL
    AND ecw.id IS NULL        -- writes already deleted
    AND child.id IS NULL
    AND ec.source NOT IN ('input', 'final')
    AND ec.step_index > 0
);
```

---

## 9. SQL DDL and Indexes

```sql
-- ─── execution_checkpoints ───────────────────────────────────────────────
CREATE TABLE execution_checkpoints (
  id                   TEXT        NOT NULL,
  execution_id         TEXT        NOT NULL,
  tenant_id            TEXT        NOT NULL,
  step_index           INTEGER     NOT NULL,
  source               TEXT        NOT NULL
                         CHECK (source IN ('input','loop','tool','approval','reclaim','final')),
  parent_checkpoint_id TEXT        REFERENCES execution_checkpoints(id) ON DELETE RESTRICT,
  state_json           JSONB       NOT NULL,
  channel_versions     JSONB       NOT NULL DEFAULT '{}'::jsonb,
  versions_seen        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  metadata_json        JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT pk_execution_checkpoints PRIMARY KEY (id),
  CONSTRAINT chk_step0_no_parent CHECK (
    (step_index = 0 AND parent_checkpoint_id IS NULL)
    OR (step_index > 0 AND parent_checkpoint_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX idx_checkpoints_exec_step_source
  ON execution_checkpoints (execution_id, step_index, source);

CREATE INDEX idx_checkpoints_exec_step_desc
  ON execution_checkpoints (execution_id, step_index DESC)
  INCLUDE (parent_checkpoint_id, source, metadata_json);

CREATE INDEX idx_checkpoints_tenant
  ON execution_checkpoints (tenant_id);

CREATE INDEX idx_checkpoints_parent
  ON execution_checkpoints (parent_checkpoint_id)
  WHERE parent_checkpoint_id IS NOT NULL;

CREATE INDEX idx_checkpoints_pruning
  ON execution_checkpoints (created_at, source, step_index)
  WHERE source NOT IN ('input', 'final') AND step_index > 0;

-- ─── execution_checkpoint_writes ─────────────────────────────────────────
CREATE TABLE execution_checkpoint_writes (
  id            TEXT        NOT NULL,
  checkpoint_id TEXT        NOT NULL REFERENCES execution_checkpoints(id) ON DELETE CASCADE,
  tenant_id     TEXT        NOT NULL,
  task_id       TEXT        NOT NULL,
  task_path     TEXT        NOT NULL DEFAULT '',
  write_index   INTEGER     NOT NULL,
  channel       TEXT        NOT NULL,
  type          TEXT        NOT NULL
                  CHECK (type IN ('message','tool_result','state_update')),
  value_json    JSONB       NOT NULL,

  CONSTRAINT pk_execution_checkpoint_writes PRIMARY KEY (id),
  CONSTRAINT uq_checkpoint_write_index UNIQUE (checkpoint_id, task_id, write_index)
);

CREATE INDEX idx_checkpoint_writes_checkpoint_id
  ON execution_checkpoint_writes (checkpoint_id, write_index ASC);

CREATE INDEX idx_checkpoint_writes_tenant
  ON execution_checkpoint_writes (tenant_id);
```

---

## 10. Drizzle ORM Schema

```ts
import { pgTable, text, integer, jsonb, timestamptz, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const executionCheckpoints = pgTable(
  'execution_checkpoints',
  {
    id:                  text('id').primaryKey(),
    executionId:         text('execution_id').notNull(),
    tenantId:            text('tenant_id').notNull(),
    stepIndex:           integer('step_index').notNull(),
    source:              text('source').notNull(),
    parentCheckpointId:  text('parent_checkpoint_id'),
    stateJson:           jsonb('state_json').notNull(),
    channelVersions:     jsonb('channel_versions').notNull().default(sql`'{}'::jsonb`),
    versionsSeen:        jsonb('versions_seen').notNull().default(sql`'{}'::jsonb`),
    metadataJson:        jsonb('metadata_json').notNull().default(sql`'{}'::jsonb`),
    createdAt:           timestamptz('created_at').notNull().defaultNow(),
  },
  (t) => ({
    checkStep0NoParent: check(
      'chk_step0_no_parent',
      sql`(${t.stepIndex} = 0 AND ${t.parentCheckpointId} IS NULL)
        OR (${t.stepIndex} > 0 AND ${t.parentCheckpointId} IS NOT NULL)`,
    ),
  }),
);

export const executionCheckpointWrites = pgTable(
  'execution_checkpoint_writes',
  {
    id:           text('id').primaryKey(),
    checkpointId: text('checkpoint_id').notNull(),
    tenantId:     text('tenant_id').notNull(),
    taskId:       text('task_id').notNull(),
    taskPath:     text('task_path').notNull().default(''),
    writeIndex:   integer('write_index').notNull(),
    channel:      text('channel').notNull(),
    type:         text('type').notNull(),
    valueJson:    jsonb('value_json').notNull(),
  },
);

// Type inference
export type ExecutionCheckpoint    = typeof executionCheckpoints.$inferSelect;
export type NewExecutionCheckpoint = typeof executionCheckpoints.$inferInsert;
export type CheckpointWrite        = typeof executionCheckpointWrites.$inferSelect;
export type NewCheckpointWrite     = typeof executionCheckpointWrites.$inferInsert;
```

---

## 11. RLS Policies

Per ADR-F1-005, all tables are protected by Row-Level Security. `app.current_tenant` is set via
`SET LOCAL` at the start of every transaction from the API layer.

```sql
ALTER TABLE execution_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE execution_checkpoint_writes ENABLE ROW LEVEL SECURITY;

-- execution_checkpoints: tenant-scoped select and insert
CREATE POLICY rls_checkpoints_tenant
ON execution_checkpoints
USING (
  tenant_id = current_setting('app.current_tenant', true)
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant', true)
);

-- execution_checkpoint_writes: tenant-scoped select and insert
CREATE POLICY rls_checkpoint_writes_tenant
ON execution_checkpoint_writes
USING (
  tenant_id = current_setting('app.current_tenant', true)
)
WITH CHECK (
  tenant_id = current_setting('app.current_tenant', true)
);

-- Service role bypass for background jobs (prune, migration)
CREATE ROLE octo_background_job;
ALTER POLICY rls_checkpoints_tenant ON execution_checkpoints
  USING (tenant_id = current_setting('app.current_tenant', true)
         OR current_user = 'octo_background_job');
```

---

## 12. Python Implementation

### 12.1 Data models

```python
from __future__ import annotations
from typing import Any, Literal
from datetime import datetime
from pydantic import BaseModel, Field
from decimal import Decimal


CheckpointSource = Literal["input", "loop", "tool", "approval", "reclaim", "final"]
WriteType = Literal["message", "tool_result", "state_update"]


class PendingWrite(BaseModel):
    task_id:    str
    task_path:  str = ""
    channel:    str
    type:       WriteType
    value:      dict[str, Any]


class ExecutionCheckpointRow(BaseModel):
    id:                   str
    execution_id:         str
    tenant_id:            str
    step_index:           int
    source:               CheckpointSource
    parent_checkpoint_id: str | None
    state_json:           dict[str, Any]
    channel_versions:     dict[str, Any]
    versions_seen:        dict[str, Any]
    metadata_json:        dict[str, Any]
    created_at:           datetime


class CheckpointTuple(BaseModel):
    """Runtime representation after load — mirrors LangGraph CheckpointTuple."""
    checkpoint:     ExecutionCheckpointRow
    pending_writes: list[PendingWrite]
    parent_id:      str | None
```

### 12.2 CheckpointService (Python runtime-worker)

```python
import json
from uuid_extensions import uuid7str   # pip install uuid-extensions
from datetime import datetime, timezone


class CASConflictError(Exception):
    pass


class CheckpointLineageBrokenError(Exception):
    pass


class CheckpointService:
    """
    Manages checkpoint persistence for a single execution.
    All methods are async and execute within a shared database connection
    that has SET LOCAL app.current_tenant already applied.
    """

    def __init__(self, db, tenant_id: str, execution_id: str) -> None:
        self._db = db
        self._tenant_id = tenant_id
        self._execution_id = execution_id
        self._schema_version = 1

    # ─── Write ─────────────────────────────────────────────────────────────

    async def commit(
        self,
        step_index: int,
        source: CheckpointSource,
        state: dict[str, Any],
        writes: list[PendingWrite],
        parent_checkpoint_id: str | None,
        channel_versions: dict[str, Any],
        versions_seen: dict[str, Any],
        expected_version: int,
        lease_owner: str,
        outbox_event_payload: dict[str, Any],
        outbox_sequence: int,
    ) -> str:
        """Atomic 5-statement commit. Returns new checkpoint_id."""
        checkpoint_id = uuid7str()
        step_id = uuid7str()
        event_id = uuid7str()
        metadata = {
            "checkpoint_schema_version": self._schema_version,
            "committed_at": datetime.now(timezone.utc).isoformat(),
        }

        async with self._db.transaction():
            # 1. Insert checkpoint
            await self._db.execute(
                """
                INSERT INTO execution_checkpoints
                  (id, execution_id, tenant_id, step_index, source,
                   parent_checkpoint_id, state_json, channel_versions,
                   versions_seen, metadata_json)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                """,
                checkpoint_id, self._execution_id, self._tenant_id,
                step_index, source, parent_checkpoint_id,
                json.dumps(state),
                json.dumps(channel_versions),
                json.dumps(versions_seen),
                json.dumps(metadata),
            )

            # 2. Insert writes
            for idx, w in enumerate(writes):
                await self._db.execute(
                    """
                    INSERT INTO execution_checkpoint_writes
                      (id, checkpoint_id, tenant_id, task_id, task_path,
                       write_index, channel, type, value_json)
                    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
                    """,
                    uuid7str(), checkpoint_id, self._tenant_id,
                    w.task_id, w.task_path, idx,
                    w.channel, w.type, json.dumps(w.value),
                )

            # 3. Insert execution step
            await self._db.execute(
                """
                INSERT INTO execution_steps
                  (id, execution_id, tenant_id, step_index, step_type, status)
                VALUES ($1,$2,$3,$4,'CHECKPOINT','SUCCEEDED')
                """,
                step_id, self._execution_id, self._tenant_id, step_index,
            )

            # 4. Insert outbox event
            await self._db.execute(
                """
                INSERT INTO outbox_events
                  (id, tenant_id, aggregate_type, aggregate_id,
                   event_type, sequence, payload_json)
                VALUES ($1,$2,'execution',$3,'ExecutionStepCheckpointed',$4,$5)
                """,
                event_id, self._tenant_id, self._execution_id,
                outbox_sequence, json.dumps(outbox_event_payload),
            )

            # 5. CAS guard
            result = await self._db.execute(
                """
                UPDATE executions
                SET version = version + 1, updated_at = now()
                WHERE id = $1
                  AND tenant_id = $2
                  AND version = $3
                  AND lease_owner = $4
                  AND state = 'RUNNING'
                """,
                self._execution_id, self._tenant_id,
                expected_version, lease_owner,
            )
            if result.rowcount != 1:
                raise CASConflictError(
                    f"CAS conflict on execution={self._execution_id} "
                    f"expected_version={expected_version} "
                    f"lease_owner={lease_owner}"
                )

        return checkpoint_id

    # ─── Read ──────────────────────────────────────────────────────────────

    async def load_latest(self) -> CheckpointTuple | None:
        """Load latest checkpoint with its pending writes."""
        row = await self._db.fetch_one(
            """
            SELECT * FROM execution_checkpoints
            WHERE execution_id = $1 AND tenant_id = $2
            ORDER BY step_index DESC
            LIMIT 1
            """,
            self._execution_id, self._tenant_id,
        )
        if row is None:
            return None

        writes_rows = await self._db.fetch_all(
            """
            SELECT * FROM execution_checkpoint_writes
            WHERE checkpoint_id = $1 AND tenant_id = $2
            ORDER BY write_index ASC
            """,
            row["id"], self._tenant_id,
        )

        checkpoint = ExecutionCheckpointRow(**dict(row))
        pending = [PendingWrite(**dict(w)) for w in writes_rows]
        return CheckpointTuple(
            checkpoint=checkpoint,
            pending_writes=pending,
            parent_id=checkpoint.parent_checkpoint_id,
        )

    async def load_by_id(self, checkpoint_id: str) -> CheckpointTuple | None:
        row = await self._db.fetch_one(
            """
            SELECT * FROM execution_checkpoints
            WHERE id = $1 AND execution_id = $2 AND tenant_id = $3
            """,
            checkpoint_id, self._execution_id, self._tenant_id,
        )
        if row is None:
            return None
        writes_rows = await self._db.fetch_all(
            "SELECT * FROM execution_checkpoint_writes "
            "WHERE checkpoint_id = $1 AND tenant_id = $2 ORDER BY write_index ASC",
            row["id"], self._tenant_id,
        )
        return CheckpointTuple(
            checkpoint=ExecutionCheckpointRow(**dict(row)),
            pending_writes=[PendingWrite(**dict(w)) for w in writes_rows],
            parent_id=dict(row)["parent_checkpoint_id"],
        )

    # ─── Lineage ───────────────────────────────────────────────────────────

    async def validate_lineage(
        self,
        from_checkpoint_id: str,
        max_steps: int = 10_000,
    ) -> bool:
        """
        Traverse parent_checkpoint_id chain to step_index=0.
        Returns True if lineage is intact, False on any break or cycle.
        """
        current_id: str | None = from_checkpoint_id
        visited = 0

        while current_id is not None:
            row = await self._db.fetch_one(
                """
                SELECT step_index, parent_checkpoint_id
                FROM execution_checkpoints
                WHERE id = $1 AND execution_id = $2 AND tenant_id = $3
                """,
                current_id, self._execution_id, self._tenant_id,
            )
            if row is None and visited > 0:
                # Missing parent in chain
                return False
            if row is None:
                break

            current_id = dict(row)["parent_checkpoint_id"]
            visited += 1

            if visited > max_steps:
                return False  # Cycle or abnormally deep chain

        return True

    async def load_with_fallback(self) -> CheckpointTuple:
        """
        Load latest checkpoint; fall back to parent if state_json invalid.
        Raises CheckpointLineageBrokenError if no valid checkpoint found.
        """
        row = await self._db.fetch_one(
            """
            SELECT * FROM execution_checkpoints
            WHERE execution_id = $1 AND tenant_id = $2
            ORDER BY step_index DESC
            LIMIT 1
            """,
            self._execution_id, self._tenant_id,
        )
        if row is None:
            raise CheckpointLineageBrokenError("No checkpoints found")

        current = dict(row)
        while True:
            if self._is_valid(current["state_json"], current["metadata_json"]):
                writes_rows = await self._db.fetch_all(
                    "SELECT * FROM execution_checkpoint_writes "
                    "WHERE checkpoint_id = $1 AND tenant_id = $2 ORDER BY write_index",
                    current["id"], self._tenant_id,
                )
                return CheckpointTuple(
                    checkpoint=ExecutionCheckpointRow(**current),
                    pending_writes=[PendingWrite(**dict(w)) for w in writes_rows],
                    parent_id=current["parent_checkpoint_id"],
                )

            parent_id = current["parent_checkpoint_id"]
            if parent_id is None:
                raise CheckpointLineageBrokenError(
                    f"No valid checkpoint in lineage for execution={self._execution_id}"
                )

            parent_row = await self._db.fetch_one(
                "SELECT * FROM execution_checkpoints WHERE id = $1 AND tenant_id = $2",
                parent_id, self._tenant_id,
            )
            if parent_row is None:
                raise CheckpointLineageBrokenError(
                    f"Parent checkpoint {parent_id} missing (lineage broken)"
                )
            current = dict(parent_row)

    def _is_valid(
        self,
        state_json: dict[str, Any],
        metadata_json: dict[str, Any],
    ) -> bool:
        """Basic schema validation. Replace with full JSON Schema check in production."""
        try:
            version = metadata_json.get("checkpoint_schema_version", 0)
            if version != self._schema_version:
                return False
            if not isinstance(state_json, dict):
                return False
            if "messages" not in state_json:
                return False
            return True
        except Exception:
            return False
```

---

## 13. TypeScript CheckpointService Interface

```ts
export type CheckpointSource =
  | 'input'
  | 'loop'
  | 'tool'
  | 'approval'
  | 'reclaim'
  | 'final';

export type WriteType = 'message' | 'tool_result' | 'state_update';

export interface PendingWrite {
  taskId:    string;
  taskPath:  string;
  channel:   string;
  type:      WriteType;
  value:     Record<string, unknown>;
}

export interface ExecutionCheckpointRow {
  id:                  string;
  executionId:         string;
  tenantId:            string;
  stepIndex:           number;
  source:              CheckpointSource;
  parentCheckpointId:  string | null;
  stateJson:           Record<string, unknown>;
  channelVersions:     Record<string, unknown>;
  versionsSeen:        Record<string, unknown>;
  metadataJson:        Record<string, unknown>;
  createdAt:           Date;
}

export interface CheckpointTuple {
  checkpoint:    ExecutionCheckpointRow;
  pendingWrites: PendingWrite[];
  parentId:      string | null;
}

export interface CommitCheckpointInput {
  stepIndex:           number;
  source:              CheckpointSource;
  state:               Record<string, unknown>;
  writes:              PendingWrite[];
  parentCheckpointId:  string | null;
  channelVersions:     Record<string, unknown>;
  versionsSeen:        Record<string, unknown>;
  expectedVersion:     number;
  leaseOwner:          string;
  outboxEventPayload:  Record<string, unknown>;
  outboxSequence:      number;
}

export interface ICheckpointService {
  /** Atomic 5-statement commit. Returns new checkpoint_id. */
  commit(input: CommitCheckpointInput): Promise<string>;

  /** Load latest checkpoint with pending writes. */
  loadLatest(): Promise<CheckpointTuple | null>;

  /** Load a specific checkpoint by ID. */
  loadById(checkpointId: string): Promise<CheckpointTuple | null>;

  /**
   * Validate lineage from a checkpoint back to step_index=0.
   * Returns false on any break or cycle.
   */
  validateLineage(fromCheckpointId: string, maxSteps?: number): Promise<boolean>;

  /**
   * Load latest valid checkpoint, falling back to parent on validation failure.
   * Throws CheckpointLineageBrokenError if no valid checkpoint found.
   */
  loadWithFallback(): Promise<CheckpointTuple>;
}
```

---

## 14. Cross-Reference: Source Frameworks

### LangGraph (`langchain-ai/langgraph`)

LangGraph's `BaseCheckpointSaver` is the primary reference. Its `CheckpointTuple` structure
(checkpoint + config + metadata + parent_config + pending_writes) maps directly to OCTO's design.

| LangGraph Concept | OCTO Implementation |
|---|---|
| `Checkpoint` with `channel_values`, `channel_versions`, `versions_seen` | `execution_checkpoints.state_json`, `channel_versions`, `versions_seen` |
| `put_writes` for pending writes | `execution_checkpoint_writes` table |
| `parent_config` enabling backward traversal | `parent_checkpoint_id` FK |
| UUID v6 for monotonic ordering | UUIDv7 in `id` field |
| `v` field (schema version) in TypedDict | `checkpoint_schema_version` in `metadata_json` |

LangGraph stores pending writes from successfully completed nodes when another node fails, so that on
resume the successful nodes aren't re-run. OCTO adopts this exact pattern.

### CrewAI (`crewaiinc/crewai`)

CrewAI checkpoints automatically on `task_completed` and `crew_kickoff_completed`. Key practices:

- `crew.kickoff(from_checkpoint=CheckpointConfig(restore_from=...))` → maps to OCTO resume
- `Crew.fork(config, branch="...")` prevents checkpoint collisions → maps to OCTO fork operation
- `max_checkpoints` limits storage with oldest-first pruning → maps to OCTO pruning job

### Microsoft Agent Framework (`microsoft/agent-framework`)

Creates checkpoints at end of each superstep capturing executors, pending messages, pending
requests/responses, and shared states. `CheckpointManager` provides pluggable backends. OCTO adopts
the superstep-boundary checkpoint model.

### AutoGen (`microsoft/autogen`)

`save_state()` and `load_state()` export full agent/team state, enabling conversation restoration.
This validates OCTO's requirement (I-P3) that `state_json` must include complete `messages[]` array.

### Hermes (`TheCraigHewitt/hermes-chief-of-staff`)

Checkpoint v2 with automatic pruning and session resume after restart. Incremental state saving with
checkpoints every 15 minutes. OCTO adopts the pruning strategy and auto-resume on restart semantics.

### Paperclip (`paperclipai/paperclip`)

Atomic task checkout and budget enforcement ensure double-work prevention and runaway spend control.
OCTO includes `budget_snapshot_json` in execution context snapshot (§3.1 `metadata_json`) to achieve
the same atomicity between execution progress and cost tracking.

### n8n (`n8n-io/n8n`)

Cautionary pattern: static data does not persist between executions in test mode. OCTO explicitly
avoidsthis anti-pattern by making PostgreSQL the sole system of record for all durable state.

---

## 15. Enriched Invariants

These extend §4 with persistence-layer invariants derived from framework analysis.

**I-P1: Checkpoint Format Versioning** (from LangGraph `v` field)
`metadata_json` MUST contain `checkpoint_schema_version: integer` (starting at 1). The runtime MUST
validate on load and reject checkpoints with unsupported versions, emitting `CHECKPOINT_SCHEMA_VERSION_UNSUPPORTED`.

**I-P2: Pending Writes Atomicity** (from LangGraph `put_writes`)
`execution_checkpoint_writes` rows for a given `checkpoint_id` are committed in the same transaction
as the checkpoint row. Partial writes are uncommitted and ignored on recovery.

**I-P3: Complete Message History in State** (from AutoGen `save_state`)
`state_json` of every checkpoint MUST include the complete `messages[]` array up to that step, in
ordered sequence. Implementations MUST NOT store only deltas from the previous checkpoint.

**I-P4: Tenant Isolation** (from ADR-F1-005)
Every row includes `tenant_id`. RLS policies enforce isolation. Cross-tenant checkpoint access is
impossible by database design.

**I-P5: Checkpoint Source Enforcement**
The `source` enum value MUST accurately reflect the context in which the checkpoint was created.
Runtime MUST set this correctly. Misuse of `source` values breaks audit trail correctness.

**I-P6: Lineage Completeness on Reclaim** (from LangGraph parent_config validation)
On reclaim, runtime MUST validate lineage from loaded checkpoint to step 0 before resuming. A lineage
break constitutes `CHECKPOINT_LINEAGE_BROKEN` and transitions execution to `FAILED`.

**I-P7: Immutability of Committed Checkpoints**
Once committed, `parent_checkpoint_id`, `step_index`, and `state_json` are immutable. No runtime
may perform UPDATE on these fields. New state is always achieved by inserting new checkpoints.

**I-P8: Lease Ownership Before Write**
No runtime may commit a checkpoint without holding the execution lease (verified by CAS guard in §5).
A checkpoint commit that bypasses the CAS is invalid and must be rolled back.

---

## 16. Alternatives Rejected

See §1 for the full evaluation table.

Additionally rejected:

- **Redis-only checkpoints:** Redis is explicitly not the system of record (OCTO Principle #12).
  Redis failure would corrupt all in-flight execution state. Rejected.
- **In-memory checkpoint accumulation with batch flush:** Silently drops state on crash before flush.
  Incompatible with durable execution guarantee. Rejected.
- **Append-only checkpoint log without parent pointers:** Lineage traversal would require full
  execution scan. O(N) traversal with parent pointers is superior. Rejected.

---

## 17. Consequences

### Positive

- Checkpoint commits are fully atomic with step and event writes.
- Lineage validation is O(N) via parent pointers — no full table scan.
- Schema validation on read provides early corruption detection.
- Parent fallback enables graceful recovery from single-step corruption.
- Fork from historical checkpoints enables safe operator experimentation.
- Pending writes separation prevents re-execution of completed nodes on partial failure.

### Negative

| Consequence | Mitigation |
|---|---|
| Write amplification: 1 checkpoint + N writes per step | Acceptable for F1 scale (50 concurrent); batch writes considered for F2+ |
| JSONB grows with context window size | 30-day pruning policy; compression deferred to F2+ |
| Long-running executions accumulate large checkpoint chains | Background pruning job; `max_checkpoints` per execution configurable |
| Schema evolution requires version migration | `checkpoint_schema_version` with validation on load |
| Partial prune failure could affect in-use checkpoints | Prune only orphaned checkpoints with no approval reference and no recent children |

### New Consequence — Checkpoint Lineage is Append-Only

Once a checkpoint is committed, its `parent_checkpoint_id`, `step_index`, and `state_json` are
**immutable** (I-P7). Updates are achieved by writing new checkpoints with updated parent pointers,
never by in-place modification.

---

## 18. Non-Goals (Confirmed for F1)

| Excluded Feature | Target Phase | Rationale |
|---|---|---|
| Distributed checkpoint coordination across multiple workers | F2+ | F1 single-worker-per-execution; distributed coordination deferred |
| Checkpoint encryption at rest | F2+ | RLS + access control sufficient for F1; field-level encryption is hardening |
| Time-travel UI for checkpoint selection | F2+ | Infrastructure laid in F1; UI affordance deferred |
| Cross-execution checkpoint sharing (memory across runs) | F3+ | Separate memory system; checkpoint model scoped to single execution |
| Checkpoint compression for long-running executions | F2+ | Acceptable growth in F1; compression is optimization |
| Automatic checkpoint repair on lineage corruption | F2+ | Auto-repair risks silent data loss; operator intervention required |

---

## 19. Conformance Test Suite

All tests MUST pass before F1 can be declared **STABLE**.

| Test ID | Description | Type |
|---|---|---|
| `CHK-001` | Commit checkpoint → `rowcount = 1` on all 5 statements | Integration |
| `CHK-002` | Simulated TX abort → no checkpoint row, no writes, no step | Integration |
| `CHK-003` | CAS conflict (stale version) → `CASConflictError` raised | Integration |
| `CHK-004` | Load latest checkpoint → correct `state_json` and ordered writes | Integration |
| `CHK-005` | Corrupt `state_json` → fallback to parent checkpoint | Integration |
| `CHK-006` | Lineage traversal from step N to step 0 → completes successfully | Integration |
| `CHK-007` | Corrupt `parent_checkpoint_id` → `CHECKPOINT_LINEAGE_BROKEN` + execution `FAILED` | Integration |
| `CHK-008` | `step_index` duplicate attempt → unique index violation | Integration |
| `CHK-009` | `step_index = 0` with `parent_checkpoint_id` set → CHECK constraint violation | Integration |
| `CHK-010` | Cross-tenant checkpoint read → RLS blocks, returns empty | Integration |
| `CHK-011` | `checkpoint_schema_version` mismatch → validation error on load | Unit |
| `CHK-012` | `messages[]` absent from `state_json` → validation error | Unit |
| `CHK-013` | Pruning job → `input` and `final` checkpoints not deleted | Integration |
| `CHK-014` | Pruning job → checkpoint referenced by active approval not deleted | Integration |
| `CHK-015` | Fork from historical checkpoint → new execution, independent lineage | Integration |
| `CHK-016` | Resume from `PAUSED` → resumes from checkpoint, not from start | Integration |
| `CHK-017` | Worker crash mid-step → reclaim from last committed checkpoint | Chaos |
| `CHK-018` | Cycle detection in lineage traversal → detected, returns false | Unit |
| `CHK-019` | Lineage depth > max_steps → detected, returns false | Unit |
| `CHK-020` | Replay from step 0 → deterministic output matches original | Replay |

---

## 20. Exit Criteria Integration

For F1 to be declared **STABLE**, all items in this table must be green:

| Requirement | Test | Blocking? |
|---|---|---|
| Checkpoint lineage validation on reclaim | CHK-007 | Yes |
| Pending writes atomicity | CHK-002 | Yes |
| Complete message history in `state_json` | CHK-012 | Yes |
| Checkpoint versioning | CHK-011 | Yes |
| Pruning safety | CHK-013, CHK-014 | Yes |
| Fork from historical checkpoint | CHK-015 | No (F1 complete, not F1 stable) |
| Cross-tenant isolation | CHK-010 | Yes |
| CAS enforcement | CHK-003 | Yes |
| Crash recovery from checkpoint | CHK-017 | Yes |
| Replay determinism | CHK-020 | Yes |

---

## 21. Related ADRs

| ADR | Relationship |
|---|---|
| [ADR-F1-001 — Durable Execution Semantics](./F1-ADR-001-durable-execution-semantics.md) | This ADR implements the checkpoint model required by ADR-F1-001 invariants: I-5 (lineage validation), I-6 (pending writes atomicity), I-7 (complete message history) |
| [ADR-F1-002 — Replay Semantics and Determinism Rules](./F1-ADR-002-replay-semantics-and-determinism-rules.md) | Replay depends on this ADR for checkpoint loading protocol (§6) |
| ADR-F1-005 — Tenant Isolation and PostgreSQL RLS | `tenant_id` enforcement across checkpoint tables (§11) |
| `F1.md §4.12` | Canonical checkpoint model definition |
| `F1.md §7` | Durable execution contracts |
| `docs/adr/F0-002-langgraph-runtime-contracts.md` | `BaseCheckpointSaver` interface origin |
| `OCTO-v5-arquitectura.md §Principles #4, #12` | DAG-based execution and PostgreSQL as system of record |
