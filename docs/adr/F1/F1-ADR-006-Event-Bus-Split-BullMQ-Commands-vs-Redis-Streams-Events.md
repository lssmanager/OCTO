# ADR-F1-006 — Event Bus Split: BullMQ Commands vs Redis Streams Events

**Status:** Accepted  
**Phase:** F1 — Core Runtime & Real Agent Execution  
**Author:** OCTO Architecture  
**Date:** 2026-05-22  
**Issue:** [#99](https://github.com/lssmanager/OCTO/issues/99)  
**Supersedes:** ADR-F1-006 Proposed  

---

## Table of Contents

1. [Context](#1-context)
2. [Decision](#2-decision)
3. [Semantic Boundary](#3-semantic-boundary)
4. [BullMQ Command Queues](#4-bullmq-command-queues)
5. [Redis Streams Event Bus](#5-redis-streams-event-bus)
6. [Transactional Outbox Bridge](#6-transactional-outbox-bridge)
7. [Canonical Contracts](#7-canonical-contracts)
8. [Mandatory F1 Domain Events](#8-mandatory-f1-domain-events)
9. [Implementation Blueprint](#9-implementation-blueprint)
10. [SQL DDL and Indexes](#10-sql-ddl-and-indexes)
11. [Consumers and Idempotency](#11-consumers-and-idempotency)
12. [Observability, Metrics and Alerts](#12-observability-metrics-and-alerts)
13. [Invariants](#13-invariants)
14. [Failure and Recovery Model](#14-failure-and-recovery-model)
15. [Alternatives Rejected](#15-alternatives-rejected)
16. [Consequences](#16-consequences)
17. [Cross-Framework Validation](#17-cross-framework-validation)
18. [Validation Test Suite](#18-validation-test-suite)
19. [Operational Runbook](#19-operational-runbook)
20. [Exit Criteria Integration](#20-exit-criteria-integration)
21. [Related ADRs](#21-related-adrs)
22. [References](#22-references)

---

## 1. Context

OCTO F1 introduces real durable agent execution. That means executions are no longer UI state, in-memory loops or best-effort background tasks. They become distributed runtime work coordinated through workers, durable state transitions, checkpoints, approvals, tool invocations, retries, reclaim and timeline projections.

This creates two different asynchronous communication needs:

1. **Commands of work**: dispatch, retry, reclaim, cancel, resume and async tool result handling. These require queue semantics, retries, backoff, delayed scheduling, dead-letter handling and explicit worker ownership.
2. **Domain/runtime events**: `ExecutionStarted`, `ExecutionStepCompleted`, `ToolInvocationStarted`, `ApprovalRequested`, `ExecutionSucceeded`, etc. These require fan-out, short-term replay, independent consumers, auditability and timeline projection.

Using one mechanism for both creates architectural drift:

- If the event bus schedules retries, it becomes an implicit scheduler.
- If command queues are used as UI event streams, UI, Ops and audit consumers become coupled to runtime control flow.
- If events are emitted directly before durable commits, OCTO can show phantom timeline entries for state that never existed in PostgreSQL.
- If queue jobs are treated as the source of truth, Redis becomes a hidden persistence authority, violating the PostgreSQL-first doctrine.

OCTO therefore separates the two planes:

```text
BullMQ          -> command plane: durable work orchestration
Redis Streams   -> event plane: domain/runtime projection and fan-out
PostgreSQL      -> system of record: executions, checkpoints, outbox, audit
Outbox Publisher -> transactional bridge from committed DB state to stream
```

This ADR materializes the F1 event-driven architecture described by the F1 runtime plan: BullMQ is used for work commands, Redis Streams is used for consumable events, and `outbox_events` ensures events are published only after the business transaction commits.

---

## 2. Decision

OCTO F1 adopts a **split event bus architecture**:

| Plane | Technology | Owns | Must Not Own |
|---|---|---|---|
| Command plane | BullMQ | Work dispatch, retry, reclaim, cancel, resume, async tool callbacks, DLQ for poisoned jobs | UI timeline, audit fan-out, domain projection |
| Event plane | Redis Streams | Post-commit domain/runtime event fan-out, short-term replay, WebSocket/SSE projection, Ops metrics, audit sinks | Scheduling, retries, worker ownership, runtime state transitions |
| Durable truth | PostgreSQL | Execution state, steps, checkpoints, outbox, audit, DLQ, sequence assignment | Ephemeral queue state |
| Bridge | Outbox Publisher | Publishing committed outbox rows into Redis Streams | Business state changes |

The event bus is a projection channel, not a control channel. Runtime control decisions come from state in PostgreSQL plus BullMQ commands. Redis Streams consumers may render, audit, alert or aggregate metrics, but they do not decide execution transitions.

---

## 3. Semantic Boundary

### 3.1 Commands vs Events

A **command** is an instruction to perform work.

```text
execution.dispatch
execution.retry
execution.reclaim
execution.cancel
execution.resume
tool.async.result
ops.dlq.reprocess
```

A **domain/runtime event** is a fact that already happened after a durable transition.

```text
ExecutionQueued
ExecutionDispatched
ExecutionStarted
ExecutionStepCompleted
ExecutionCheckpointed
ToolInvocationStarted
ToolInvocationCompleted
ApprovalRequested
ApprovalResolved
ExecutionSucceeded
ExecutionFailed
ExecutionCancelled
ExecutionReclaimed
```

### 3.2 Naming Rules

| Object | Naming convention | Example |
|---|---|---|
| Queue | dotted command name | `execution.dispatch` |
| Job name | verb/object | `dispatchExecution` |
| Stream | internal event stream | `octo.events` |
| Consumer group | `octo.events:<consumer>` | `octo.events:web-gateway` |
| Event type | PascalCase past tense | `ExecutionStarted` |
| Metrics labels | snake_case | `queue_name="execution.dispatch"` |

### 3.3 Correctness Rule

OCTO does **not** claim distributed exactly-once side effects. BullMQ, Redis Streams and workers operate under realistic at-least-once delivery assumptions. F1 achieves **effectively-once state transitions** by combining:

- deterministic `jobId` for command enqueue idempotency,
- PostgreSQL CAS transitions,
- idempotency keys,
- checkpoint lineage,
- unique event identifiers,
- consumer deduplication by `event_id`, and
- outbox replay with `published_at` tracking.

---

## 4. BullMQ Command Queues

### 4.1 Exclusive Responsibilities

BullMQ is the durable work orchestration layer for:

- dispatching executions to workers,
- retrying recoverable execution failures,
- reclaiming zombie executions after lease expiry,
- cooperative cancellation,
- resuming paused executions after approvals,
- processing long-running async tool results,
- routing poisoned jobs to operational DLQ, and
- manually reprocessing jobs under Ops gate.

BullMQ is not used for event fan-out, audit projection or UI timeline streaming.

### 4.2 Queue Topology

| Queue | Target worker | Priority | Job ID | Purpose |
|---|---|---:|---|---|
| `execution.dispatch` | `scheduler-worker` | high | `execution_id` | Move `QUEUED` execution into dispatch flow |
| `execution.retry` | `scheduler-worker` | normal | `execution_id:retry:<attempt>` | Delayed retry after recoverable error |
| `execution.reclaim` | `scheduler-worker` | high | `execution_id:reclaim:<lease_version>` | Reclaim stale execution after lease expiry |
| `execution.cancel` | `runtime-worker` | critical | `execution_id:cancel:<command_id>` | Cooperative cancellation request |
| `execution.resume` | `scheduler-worker` | high | `execution_id:resume:<approval_id>` | Resume paused execution |
| `tool.async.result` | `runtime-worker` | normal | `tool_invocation_id` | Continue run after async tool callback |
| `ops.dlq.reprocess` | `ops/manual` | low | `dlq_id` | Manual replay/reprocess from DLQ |

### 4.3 Canonical Job Options

```typescript
import type { JobsOptions, QueueOptions } from 'bullmq';

export const OCTO_DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 2_000,
    jitter: 0.25,
  },
  removeOnComplete: { count: 100 },
  removeOnFail: false,
};

export const queueOptions: QueueOptions = {
  defaultJobOptions: OCTO_DEFAULT_JOB_OPTIONS,
};
```

### 4.4 Command Envelope

```typescript
export type OctoCommandType =
  | 'execution.dispatch'
  | 'execution.retry'
  | 'execution.reclaim'
  | 'execution.cancel'
  | 'execution.resume'
  | 'tool.async.result'
  | 'ops.dlq.reprocess';

export interface OctoCommandEnvelope<TPayload extends Record<string, unknown>> {
  commandId: string;       // UUIDv7
  commandType: OctoCommandType;
  tenantId: string;
  executionId?: string;
  toolInvocationId?: string;
  issuedBy: 'api' | 'scheduler-worker' | 'runtime-worker' | 'ops';
  traceId: string;
  createdAt: string;       // ISO 8601
  idempotencyKey: string;
  payload: TPayload;
}
```

### 4.5 Dispatch Command Payload

```typescript
export interface ExecutionDispatchCommandPayload {
  executionId: string;
  tenantId: string;
  agentId: string;
  runId: string;
  expectedState: 'QUEUED' | 'RETRY_SCHEDULED' | 'RECLAIMING';
  expectedVersion: number;
  attempt: number;
  source: 'api' | 'scheduler' | 'reconciler' | 'ops';
}
```

### 4.6 Enqueue Rule

```typescript
await dispatchQueue.add(
  'dispatchExecution',
  commandEnvelope,
  {
    jobId: executionId,
    priority: OCTO_QUEUE_PRIORITIES.high,
  },
);
```

`jobId = execution_id` is mandatory for `execution.dispatch` to suppress duplicate enqueue attempts while the job remains present in BullMQ. Commands that represent distinct transitions for the same execution include the transition identity in the job id, such as `execution_id:resume:<approval_id>`.

### 4.7 Write-Before-Ack

A BullMQ worker may only return success after the minimum durable effect has been committed to PostgreSQL:

```text
process job
  -> start DB transaction
  -> validate state + tenant + lease
  -> perform CAS transition
  -> insert execution_step
  -> insert outbox_event
  -> commit
  -> return success to BullMQ
```

If the DB transaction fails, the job fails and BullMQ retry/backoff applies.

---

## 5. Redis Streams Event Bus

### 5.1 Exclusive Responsibilities

Redis Streams is the domain/runtime event plane for:

- post-commit event publication from `outbox_events`,
- fan-out to WebSocket/SSE gateway,
- audit sink consumption,
- Ops dashboard metrics aggregation,
- short-term event replay for active UI timelines,
- trace propagation (`trace_id`, `span_id`), and
- future agent-to-agent projection substrate in F2+.

Redis Streams is not the runtime scheduler and is not a source of truth for execution state.

### 5.2 Stream Topology

```text
Stream: octo.events

Consumer groups:
  octo.events:web-gateway     -> UI timeline via SSE/WebSocket
  octo.events:audit-sink      -> audit_log persistence
  octo.events:ops-metrics     -> Prometheus aggregation
  octo.events:projection      -> optional read model/materialized views
  octo.events:agent-bus       -> future F2+ agent message projection
```

`octo.events` is an internal infrastructure stream. It is not exposed directly to tenants. Every event contains `tenant_id`, and every consumer enforces tenant scope before rendering or persisting projections. Tenant-specific Redis cache keys remain prefixed as defined by ADR-F1-005.

### 5.3 Delivery Semantics

| Property | Semantics |
|---|---|
| Delivery | At-least-once per consumer group |
| Consumer ack | `XACK` only after durable side effect or successful projection |
| Deduplication | Consumer-side by `event_id` |
| Ordering | Logical order by `sequence` per `aggregate_id`, not by Redis stream ID |
| Replay | Recent replay from Redis Streams; strong replay from PostgreSQL `outbox_events` |
| Retention | Sliding window with `MAXLEN ~ 10000` minimum for F1 |
| Failure recovery | `XPENDING`/`XAUTOCLAIM` for stuck pending entries |

### 5.4 XADD Shape

```text
XADD octo.events MAXLEN ~ 10000 *
  event_id evt_01HY...
  event_type ExecutionStarted
  tenant_id tenant_abc
  aggregate_type Execution
  aggregate_id exe_123
  sequence 2
  trace_id tr_abc
  span_id sp_def
  schema_version 1
  payload_json '{...}'
```

### 5.5 Why Not Redis Pub/Sub

Redis Pub/Sub has no persistence, no consumer groups, no pending entry list and no replay. It is therefore rejected for F1 runtime events. Streams are selected because they provide append-only logs, consumer groups, acknowledgement and short-term replay semantics.

---

## 6. Transactional Outbox Bridge

### 6.1 Purpose

The outbox pattern is the bridge between PostgreSQL as source of truth and Redis Streams as projection channel.

The invariant is simple:

```text
No domain event is published before the transaction that created the state change commits.
```

### 6.2 Flow

```text
API / runtime-worker / scheduler-worker
  -> BEGIN
  -> mutate business state in PostgreSQL
  -> INSERT outbox_events
  -> COMMIT

outbox-publisher
  -> SELECT unpublished rows FOR UPDATE SKIP LOCKED
  -> XADD octo.events MAXLEN ~ 10000 * ...
  -> UPDATE outbox_events SET published_at = now()
```

### 6.3 Crash Window

If the publisher crashes after `XADD` but before `UPDATE outbox_events SET published_at = now()`, the row remains unpublished and will be published again on the next cycle.

This is expected. Consumers must deduplicate by `event_id`.

### 6.4 Sequence Assignment

`sequence` is assigned when the event is inserted into `outbox_events`, inside the same transaction as the business state change. It is monotonic per `(tenant_id, aggregate_type, aggregate_id)`.

This ensures UI and audit consumers can reconstruct a correct execution timeline even if Redis stream IDs interleave events from many executions.

### 6.5 Outbox Publisher Ownership

The outbox publisher is a separate worker process, not the API and not the runtime loop. It may be deployed as:

- `apps/outbox-publisher` standalone worker, or
- a dedicated mode inside `scheduler-worker`, provided it keeps its own lifecycle, metrics and health checks.

It must not live in `apps/web`, API controllers, or runtime tool execution code.

**Concurrency model (normative):** row claiming MUST use `FOR UPDATE SKIP LOCKED` with `locked_by` / `locked_until` lease semantics.  
Single-replica F1 deployments are supported, but the claim algorithm remains the same for restart safety.  
`pg_try_advisory_lock(...)` MAY be used as optional belt-and-suspenders in local/dev, but MUST NOT replace row-level claim correctness.

---

## 7. Canonical Contracts

### 7.1 TypeScript Event Envelope

```typescript
export type OctoAggregateType = 'Execution' | 'Agent' | 'Approval' | 'ToolInvocation';

export type OctoEventType =
  | 'ExecutionQueued' | 'ExecutionDispatched' | 'ExecutionStarted' | 'ExecutionStepCompleted'
  | 'ExecutionPaused' | 'ExecutionResumed' | 'ExecutionReclaiming' | 'ExecutionReclaimed'
  | 'ExecutionRetryScheduled' | 'ExecutionSucceeded' | 'ExecutionFailed' | 'ExecutionCancelled'
  | 'ExecutionTimedOut' | 'ExecutionDLQ'
  | 'ToolInvocationStarted' | 'ToolInvocationSucceeded' | 'ToolInvocationFailed'
  | 'ToolInvocationTimedOut' | 'ToolApprovalRequested'
  | 'LLMCallStarted' | 'LLMCallCompleted' | 'LLMCallFailed' | 'LLMBudgetExceeded'
  | 'ApprovalRequested' | 'ApprovalGranted' | 'ApprovalDenied' | 'ApprovalExpired';

export interface OctoEventEnvelope<TPayload extends Record<string, unknown> = Record<string, unknown>> {
  eventId: string;          // UUIDv7
  eventType: OctoEventType;
  tenantId: string;
  aggregateType: OctoAggregateType;
  aggregateId: string;
  executionId?: string;
  agentId?: string;
  traceId: string;
  spanId: string;
  occurredAt: string;       // ISO 8601
  sequence: number;         // monotonic per aggregate
  schemaVersion: "1.0";
  payload: TPayload;
}
```

### 7.2 Zod Schema

```typescript
import { z } from 'zod';

export const OctoEventEnvelopeSchema = z.object({
  eventId: z.string().min(1),
  eventType: z.enum([
    'ExecutionQueued',
    'ExecutionDispatched',
    'ExecutionStarted',
    'ExecutionStepCompleted',
    'ExecutionPaused',
    'ExecutionResumed',
    'ExecutionReclaiming',
    'ExecutionReclaimed',
    'ExecutionRetryScheduled',
    'ExecutionSucceeded',
    'ExecutionFailed',
    'ExecutionCancelled',
    'ExecutionTimedOut',
    'ExecutionDLQ',
    'ToolInvocationStarted',
    'ToolInvocationSucceeded',
    'ToolInvocationFailed',
    'ToolInvocationTimedOut',
    'ToolApprovalRequested',
    'LLMCallStarted',
    'LLMCallCompleted',
    'LLMCallFailed',
    'LLMBudgetExceeded',
    'ApprovalRequested',
    'ApprovalGranted',
    'ApprovalDenied',
    'ApprovalExpired',
  ]),
  tenantId: z.string().min(1),
  aggregateType: z.enum(['Execution', 'Agent', 'Approval', 'ToolInvocation']),
  aggregateId: z.string().min(1),
  executionId: z.string().optional(),
  agentId: z.string().optional(),
  traceId: z.string().min(1),
  spanId: z.string().min(1),
  occurredAt: z.string().datetime(),
  sequence: z.number().int().positive(),
  schemaVersion: z.literal("1.0"),
  payload: z.record(z.unknown()),
});

export type OctoEventEnvelope = z.infer<typeof OctoEventEnvelopeSchema>;
```

### 7.3 Python Pydantic Schema

```python
from typing import Any, Literal
from pydantic import BaseModel, Field

OctoEventType = Literal[
    'ExecutionQueued',
    'ExecutionDispatched',
    'ExecutionStarted',
    'ExecutionStepCompleted',
    'ExecutionPaused',
    'ExecutionResumed',
    'ExecutionReclaiming',
    'ExecutionReclaimed',
    'ExecutionRetryScheduled',
    'ExecutionSucceeded',
    'ExecutionFailed',
    'ExecutionCancelled',
    'ExecutionTimedOut',
    'ExecutionDLQ',
    'ToolInvocationStarted',
    'ToolInvocationSucceeded',
    'ToolInvocationFailed',
    'ToolInvocationTimedOut',
    'ToolApprovalRequested',
    'LLMCallStarted',
    'LLMCallCompleted',
    'LLMCallFailed',
    'LLMBudgetExceeded',
    'ApprovalRequested',
    'ApprovalGranted',
    'ApprovalDenied',
    'ApprovalExpired',
]

class OctoEventEnvelope(BaseModel):
    event_id: str = Field(min_length=1)
    event_type: OctoEventType
    tenant_id: str = Field(min_length=1)
    aggregate_type: Literal['Execution', 'Agent', 'Approval', 'ToolInvocation']
    aggregate_id: str = Field(min_length=1)
    execution_id: str | None = None
    agent_id: str | None = None
    trace_id: str = Field(min_length=1)
    span_id: str = Field(min_length=1)
    occurred_at: str
    sequence: int = Field(gt=0)
    schema_version: Literal["1.0"] = "1.0"
    payload: dict[str, Any]
```

---

## 8. Mandatory F1 Domain Events

**Normative rule:** this table is the canonical F1-EVT-002 catalog. Zod/Pydantic contracts MUST stay in sync with it.

| Event Type | Aggregate | Trigger | Producer | Required Payload Fields | Notes |
|---|---|---|---|---|---|
| `ExecutionQueued` | Execution | execution accepted | API | `agentId`, `inputSummary` or `inputHash`, `source` | requires `inputSummary` OR `inputHash` |
| `ExecutionDispatched` | Execution | CAS `QUEUED->DISPATCHED` | scheduler-worker | `attemptNumber`, `leaseOwner` | |
| `ExecutionStarted` | Execution | CAS `DISPATCHED->RUNNING` | runtime-worker | `workerId`, `checkpointId` | `checkpointId` optional |
| `ExecutionStepCompleted` | Execution | step/checkpoint persisted | runtime-worker | `stepIndex`, `stepType`, `status` | replaces standalone `ExecutionCheckpointed` |
| `ExecutionPaused` | Execution | approval/policy gate | runtime-worker | `approvalId`, `reason` | |
| `ExecutionResumed` | Execution | approval resolved | API/runtime-worker | `approvalId`, `resolution` | |
| `ExecutionReclaiming` | Execution | stale lease detected | scheduler-worker | `staleLeaseOwner`, `newLeaseOwner` | |
| `ExecutionReclaimed` | Execution | lease recovered | scheduler-worker | `lastCheckpointId`, `stepIndex` | |
| `ExecutionRetryScheduled` | Execution | retry planned | scheduler/runtime | `errorCode`, `nextAttemptAt`, `attemptNumber` | |
| `ExecutionSucceeded` | Execution | terminal success | runtime-worker | `outputSummary`, `totalTokens`, `durationMs` | |
| `ExecutionFailed` | Execution | terminal failure | runtime/scheduler | `errorCode`, `errorMessage`, `finalAttempt` | |
| `ExecutionCancelled` | Execution | cancel applied | API/runtime-worker | `cancelledBy`, `reason` | |
| `ExecutionTimedOut` | Execution | timeout enforced | runtime/scheduler | `timeoutMs`, `lastStepIndex` | |
| `ExecutionDLQ` | Execution | poison workflow | scheduler/runtime | `poisonSignature`, `jobId` | |
| `ToolInvocationStarted` | ToolInvocation | tool call starts | runtime-worker | `toolName`, `toolKind`, `argsHash` | |
| `ToolInvocationSucceeded` | ToolInvocation | tool call completes | runtime-worker | `toolName`, `durationMs` | |
| `ToolInvocationFailed` | ToolInvocation | tool call fails | runtime-worker | `toolName`, `errorCode` | |
| `ToolInvocationTimedOut` | ToolInvocation | tool call timeout | runtime-worker | `toolName`, `timeoutMs` | |
| `ToolApprovalRequested` | ToolInvocation | approval required for tool | runtime-worker | `toolName`, `approvalId` | |
| `LLMCallStarted` | Execution | LLM request started | runtime-worker | `model`, `provider`, `stepIndex` | |
| `LLMCallCompleted` | Execution | LLM response persisted | runtime-worker | `model`, `inputTokens`, `outputTokens`, `finishReason`, `latencyMs` | |
| `LLMCallFailed` | Execution | LLM request failed | runtime-worker | `errorCode`, `provider`, `model`, `attempt` | |
| `LLMBudgetExceeded` | Execution | budget policy gate | runtime-worker | `remainingBudgetUsd`, `requiredMinUsd` | |
| `ApprovalRequested` | Approval | approval created | runtime-worker/API | `kind`, `title`, `reason`, `timeoutAt` | |
| `ApprovalGranted` | Approval | approval granted | API | `resolvedBy`, `resolutionSummary` | |
| `ApprovalDenied` | Approval | approval denied | API | `resolvedBy`, `denyReason` | |
| `ApprovalExpired` | Approval | approval timeout | scheduler/API | `timeoutAt` | |

---

## 9. Implementation Blueprint

### 9.1 `@octo/events` Package Layout

```text
packages/events/
  src/
    envelope.ts
    event-types.ts
    outbox.ts
    redis-streams.ts
    consumer.ts
    metrics.ts
    index.ts
```

### 9.2 BullMQ Queue Registry

```typescript
// packages/queue/src/queue-names.ts
export const OCTO_QUEUES = {
  executionDispatch: 'execution.dispatch',
  executionRetry: 'execution.retry',
  executionReclaim: 'execution.reclaim',
  executionCancel: 'execution.cancel',
  executionResume: 'execution.resume',
  toolAsyncResult: 'tool.async.result',
  opsDlqReprocess: 'ops.dlq.reprocess',
} as const;

export const OCTO_QUEUE_PRIORITIES = {
  critical: 1,
  high: 5,
  normal: 10,
  low: 50,
} as const;
```

### 9.3 Execution Dispatcher

```typescript
// apps/api/src/executions/execution-dispatcher.ts
import { Injectable } from '@nestjs/common';
import { Queue } from 'bullmq';
import { InjectQueue } from '@nestjs/bullmq';
import { OCTO_QUEUES, OCTO_QUEUE_PRIORITIES } from '@octo/queue';
import type { OctoCommandEnvelope } from '@octo/contracts';

@Injectable()
export class ExecutionDispatcher {
  constructor(
    @InjectQueue(OCTO_QUEUES.executionDispatch)
    private readonly dispatchQueue: Queue,
  ) {}

  async enqueueDispatch(command: OctoCommandEnvelope<Record<string, unknown>>) {
    if (!command.executionId) {
      throw new Error('execution.dispatch requires executionId');
    }

    await this.dispatchQueue.add('dispatchExecution', command, {
      jobId: command.executionId,
      priority: OCTO_QUEUE_PRIORITIES.high,
    });
  }
}
```

### 9.4 Outbox Insert API

```typescript
// packages/events/src/outbox.ts
import { sql } from 'drizzle-orm';
import type { OctoEventEnvelope } from './envelope';

export async function insertOutboxEvent(
  tx: unknown,
  envelope: OctoEventEnvelope,
): Promise<void> {
  // Pseudocode: use repository wrapper in @octo/database.
  await tx.execute(sql`
    INSERT INTO outbox_events (
      id,
      tenant_id,
      event_type,
      aggregate_type,
      aggregate_id,
      execution_id,
      agent_id,
      trace_id,
      span_id,
      sequence,
      schema_version,
      payload_json,
      occurred_at
    ) VALUES (
      ${envelope.eventId},
      ${envelope.tenantId},
      ${envelope.eventType},
      ${envelope.aggregateType},
      ${envelope.aggregateId},
      ${envelope.executionId ?? null},
      ${envelope.agentId ?? null},
      ${envelope.traceId},
      ${envelope.spanId},
      ${envelope.sequence},
      ${envelope.schemaVersion},
      ${JSON.stringify(envelope.payload)}::jsonb,
      ${envelope.occurredAt}::timestamptz
    )
  `);
}
```

### 9.5 Outbox Publisher Loop (TypeScript)

```typescript
// apps/outbox-publisher/src/outbox-publisher.service.ts
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

const STREAM_NAME = 'octo.events';
const STREAM_MAXLEN = 10_000;
const BATCH_SIZE = 100;
const MAX_PUBLISH_ATTEMPTS = 10;
const OUTBOX_RETRY_BASE_MS = 500;
const OUTBOX_RETRY_MAX_MS = 30_000;

@Injectable()
export class OutboxPublisherService implements OnModuleDestroy {
  private readonly logger = new Logger(OutboxPublisherService.name);
  private stopped = false;

  constructor(
    private readonly db: OutboxRepository,
    private readonly redis: Redis,
  ) {}

  async runLoop(): Promise<void> {
    while (!this.stopped) {
      const rows = await this.db.claimUnpublishedBatch(BATCH_SIZE);

      for (const row of rows) {
        try {
          await this.publishRow(row);
          await this.db.markPublished(row.id);
        } catch (error) {
          const attempts = row.attempt_count + 1;
          await this.db.recordPublishFailure(row.id, error, attempts);

          if (attempts >= MAX_PUBLISH_ATTEMPTS) {
            await this.db.moveToDlq(row.id, error, attempts);
          } else {
            const backoffMs = Math.min(OUTBOX_RETRY_MAX_MS, OUTBOX_RETRY_BASE_MS * 2 ** Math.min(attempts, 6));
            await this.db.scheduleNextAttempt(row.id, backoffMs);
          }
        }
      }

      await sleep(rows.length === 0 ? 1_000 : 50);
    }
  }

  private async publishRow(row: OutboxEventRow): Promise<void> {
    await this.redis.xadd(
      STREAM_NAME,
      'MAXLEN', '~', STREAM_MAXLEN.toString(),
      '*',
      'event_id', row.id,
      'event_type', row.event_type,
      'tenant_id', row.tenant_id,
      'aggregate_type', row.aggregate_type,
      'aggregate_id', row.aggregate_id,
      'execution_id', row.execution_id ?? '',
      'agent_id', row.agent_id ?? '',
      'trace_id', row.trace_id,
      'span_id', row.span_id,
      'sequence', String(row.sequence),
      'schema_version', String(row.schema_version),
      'payload_json', JSON.stringify(row.payload_json),
      'occurred_at', row.occurred_at.toISOString(),
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
  }
}
```

### 9.6 Outbox Publisher Loop (Python Runtime Variant)

```python
# apps/outbox-publisher/app/publisher.py
import asyncio
import json
from app.db import outbox_repository
from app.redis import redis
from app.metrics import metrics
from app.logger import logger

STREAM_NAME = 'octo.events'
STREAM_MAXLEN = 10_000
BATCH_SIZE = 100
MAX_ATTEMPTS = 10

async def publish_outbox_forever() -> None:
    while True:
        rows = await outbox_repository.claim_unpublished_batch(BATCH_SIZE)

        for row in rows:
            try:
                await redis.xadd(
                    STREAM_NAME,
                    fields={
                        'event_id': row.id,
                        'event_type': row.event_type,
                        'tenant_id': row.tenant_id,
                        'aggregate_type': row.aggregate_type,
                        'aggregate_id': row.aggregate_id,
                        'execution_id': row.execution_id or '',
                        'agent_id': row.agent_id or '',
                        'trace_id': row.trace_id,
                        'span_id': row.span_id,
                        'sequence': str(row.sequence),
                        'schema_version': str(row.schema_version),
                        'payload_json': json.dumps(row.payload_json),
                        'occurred_at': row.occurred_at.isoformat(),
                    },
                    maxlen=STREAM_MAXLEN,
                    approximate=True,
                )
                await outbox_repository.mark_published(row.id)
                metrics.outbox_published_total.inc()
            except Exception as exc:
                attempts = row.attempt_count + 1
                await outbox_repository.record_publish_failure(row.id, exc, attempts)
                logger.exception('outbox_publish_failed', extra={'event_id': row.id})
                if attempts >= MAX_ATTEMPTS:
                    await outbox_repository.move_to_dlq(row.id, exc, attempts)
                    metrics.outbox_dlq_total.inc()

        await asyncio.sleep(1 if not rows else 0.05)
```

### 9.7 Redis Consumer Loop

```typescript
// packages/events/src/redis-stream-consumer.ts
export interface StreamConsumerHandler {
  handle(event: OctoEventEnvelope): Promise<void>;
}

export class RedisStreamConsumer {
  constructor(
    private readonly redis: Redis,
    private readonly consumerGroup: string,
    private readonly consumerName: string,
    private readonly dedupe: EventDedupeStore,
    private readonly handler: StreamConsumerHandler,
  ) {}

  async ensureGroup(): Promise<void> {
    try {
      await this.redis.xgroup('CREATE', 'octo.events', this.consumerGroup, '$', 'MKSTREAM');
    } catch (error) {
      if (!String(error).includes('BUSYGROUP')) throw error;
    }
  }

  async run(): Promise<void> {
    await this.ensureGroup();

    while (true) {
      const response = await this.redis.xreadgroup(
        'GROUP', this.consumerGroup, this.consumerName,
        'COUNT', '50',
        'BLOCK', '5000',
        'STREAMS', 'octo.events', '>',
      );

      if (!response) continue;

      for (const [, entries] of response as RedisStreamReadResponse) {
        for (const [streamId, fields] of entries) {
          const event = parseOctoEvent(fields);

          if (await this.dedupe.seen(event.eventId, this.consumerGroup)) {
            await this.redis.xack('octo.events', this.consumerGroup, streamId);
            continue;
          }

          await this.handler.handle(event);
          await this.dedupe.markSeen(event.eventId, this.consumerGroup);
          await this.redis.xack('octo.events', this.consumerGroup, streamId);
        }
      }
    }
  }
}
```

### 9.8 Projection Rule for API Gateway

The WebSocket/SSE gateway may only project events. It must not mutate runtime state.

```typescript
class WebGatewayEventHandler implements StreamConsumerHandler {
  async handle(event: OctoEventEnvelope): Promise<void> {
    const tenantRoom = `tenant:${event.tenantId}`;
    const executionRoom = `execution:${event.executionId ?? event.aggregateId}`;

    await this.authz.ensureProjectionAllowed(event.tenantId);
    this.gateway.to(tenantRoom).to(executionRoom).emit('octo.event', event);
  }
}
```

---

## 10. SQL DDL and Indexes

### 10.1 `outbox_events`

```sql
CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  execution_id TEXT NULL,
  agent_id TEXT NULL,
  trace_id TEXT NOT NULL,
  span_id TEXT NOT NULL,
  sequence BIGINT NOT NULL,
  schema_version TEXT NOT NULL DEFAULT '1.0',
  payload_json JSONB NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at TIMESTAMPTZ NULL,
  publish_attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TIMESTAMPTZ NULL,
  last_error TEXT NULL,
  locked_by TEXT NULL,
  locked_until TIMESTAMPTZ NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_events_aggregate_sequence
  ON outbox_events (tenant_id, aggregate_type, aggregate_id, sequence);

CREATE INDEX IF NOT EXISTS idx_outbox_unpublished_due
  ON outbox_events (next_attempt_at, created_at ASC)
  WHERE published_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_events_execution
  ON outbox_events (tenant_id, execution_id, sequence)
  WHERE execution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_events_type_created
  ON outbox_events (event_type, created_at DESC);
```

### 10.2 `outbox_publish_dlq`

```sql
CREATE TABLE IF NOT EXISTS outbox_publish_dlq (
  id TEXT PRIMARY KEY,
  outbox_event_id TEXT NOT NULL REFERENCES outbox_events(id),
  tenant_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json JSONB NOT NULL,
  error_code TEXT NOT NULL,
  error_message TEXT NOT NULL,
  attempt_count INTEGER NOT NULL,
  first_attempted_at TIMESTAMPTZ NULL,
  last_attempted_at TIMESTAMPTZ NOT NULL,
  moved_to_dlq_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reprocessed_at TIMESTAMPTZ NULL,
  reprocessed_by TEXT NULL,
  reprocess_status TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_outbox_publish_dlq_open
  ON outbox_publish_dlq (moved_to_dlq_at DESC)
  WHERE reprocessed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_outbox_publish_dlq_tenant
  ON outbox_publish_dlq (tenant_id, moved_to_dlq_at DESC);
```

### 10.3 Claim Batch Query

```sql
WITH candidate AS (
  SELECT id
  FROM outbox_events
  WHERE published_at IS NULL
    AND (locked_until IS NULL OR locked_until < now())
  ORDER BY created_at ASC
  LIMIT $1
  FOR UPDATE SKIP LOCKED
)
UPDATE outbox_events AS o
SET locked_by = $2,
    locked_until = now() + interval '30 seconds',
    last_attempted_at = now()
FROM candidate
WHERE o.id = candidate.id
RETURNING o.*;
```

### 10.4 RLS Integration

`outbox_events` is tenant-scoped and must be protected by ADR-F1-005 RLS policy.

```sql
ALTER TABLE outbox_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE outbox_events FORCE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_outbox_events
  ON outbox_events
  USING (tenant_id = current_setting('app.current_tenant', true))
  WITH CHECK (tenant_id = current_setting('app.current_tenant', true));
```

Outbox publisher runs as an internal service role with explicit service authentication. It must not run as PostgreSQL superuser. If it needs cross-tenant publishing, it uses a controlled service DB role and never exposes rows to user-facing paths.

---

## 11. Consumers and Idempotency

### 11.1 Consumer Groups

| Consumer group | Side effect | Ack rule |
|---|---|---|
| `octo.events:web-gateway` | Push to SSE/WebSocket room | `XACK` after event emitted or safely dropped as unauthorized |
| `octo.events:audit-sink` | Persist audit event / security timeline | `XACK` after DB commit |
| `octo.events:ops-metrics` | Increment Prometheus counters / runtime aggregation | `XACK` after metric update |
| `octo.events:projection` | Update read models | `XACK` after projection transaction commit |

### 11.2 Dedupe Store

```typescript
export interface EventDedupeStore {
  seen(eventId: string, consumerGroup: string): Promise<boolean>;
  markSeen(eventId: string, consumerGroup: string): Promise<void>;
}

export class RedisEventDedupeStore implements EventDedupeStore {
  constructor(private readonly redis: Redis) {}

  async seen(eventId: string, consumerGroup: string): Promise<boolean> {
    const key = this.key(eventId, consumerGroup);
    return (await this.redis.exists(key)) === 1;
  }

  async markSeen(eventId: string, consumerGroup: string): Promise<void> {
    await this.redis.set(this.key(eventId, consumerGroup), '1', 'EX', 3_600);
  }

  private key(eventId: string, consumerGroup: string): string {
    return `octo:events:dedupe:${consumerGroup}:${eventId}`;
  }
}
```

### 11.3 Durable Consumer Ledger for Audit-Critical Consumers

For audit-critical consumers, Redis TTL dedupe is insufficient. Use a durable consumer ledger:

```sql
CREATE TABLE IF NOT EXISTS event_consumer_ledger (
  consumer_group TEXT NOT NULL,
  event_id TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer_group, event_id)
);
```

The audit sink uses this ledger inside the same transaction as its projection write.

### 11.4 Pending Entry Recovery

Consumers periodically inspect pending entries and claim stale messages:

```text
XPENDING octo.events octo.events:web-gateway
XAUTOCLAIM octo.events octo.events:web-gateway <consumer> 60000 0-0 COUNT 100
```

A message may be processed more than once. Idempotency is mandatory.

---

## 12. Observability, Metrics and Alerts

### 12.1 OpenTelemetry Attributes

Every command job and event publication must include:

| Attribute | Example |
|---|---|
| `tenant_id` | `tenant_abc` |
| `execution_id` | `exe_123` |
| `agent_id` | `agent_456` |
| `event_id` | `evt_789` |
| `event_type` | `ExecutionStarted` |
| `command_type` | `execution.dispatch` |
| `queue_name` | `execution.dispatch` |
| `redis_stream` | `octo.events` |
| `consumer_group` | `octo.events:web-gateway` |
| `trace_id` | `tr_abc` |
| `span_id` | `sp_def` |

Consumers MUST reconstruct parent context from envelope values:

```ts
const parentContext = propagation.extract(ROOT_CONTEXT, {
  traceparent: `00-${event.traceId}-${event.spanId}-01`,
});
const span = tracer.startSpan('process_event', undefined, parentContext);
```

```py
carrier = {"traceparent": f"00-{event.trace_id}-{event.span_id}-01"}
ctx = extract(carrier)
with trace.get_tracer(__name__).start_as_current_span("process_event", context=ctx):
    ...
```

Required attributes for consumer spans:
`octo.event_id`, `octo.event_type`, `octo.tenant_id`, `octo.aggregate_type`,
`octo.aggregate_id`, `octo.sequence`, `octo.schema_version`,
`messaging.system=redis`, `messaging.destination.name=octo.events`,
`messaging.operation=process`.

### 12.2 Prometheus Metrics

| Metric | Type | Labels | Meaning |
|---|---|---|---|
| `octo_queue_depth` | gauge | `queue_name` | Jobs waiting/delayed |
| `octo_queue_failed_total` | counter | `queue_name`, `error_code` | Failed jobs |
| `octo_queue_dlq_total` | counter | `queue_name` | Jobs moved to DLQ |
| `octo_outbox_pending_total` | gauge | none | `SELECT count(*) FROM outbox_events WHERE published_at IS NULL` |
| `octo_outbox_publish_latency_ms_bucket` | histogram | `event_type` | End-to-end publish latency from `created_at` to `published_at` |
| `octo_outbox_batch_size_bucket` | histogram | none | Outbox rows processed per poll cycle |
| `octo_outbox_published_total` | counter | `event_type` | Events published to stream |
| `octo_outbox_publish_failed_total` | counter | `event_type`, `error_code` | Publish failures |
| `octo_outbox_dlq_total` | counter | `event_type` | Events moved to publish DLQ |
| `octo_event_consumer_duplicate_total` | counter | `group`, `event_type` | Duplicate deliveries skipped by dedupe |
| `octo_event_consumer_processed_total` | counter | `group`, `event_type` | Processed events per consumer group |
| `octo_event_consumer_failed_total` | counter | `group`, `event_type` | Consumer handler failures |
| `octo_event_consumer_lag_ms_bucket` | histogram | `group` | Consumer lag from `occurred_at` |

### 12.3 Alerts

| Alert | Severity | Condition | Action |
|---|---|---|---|
| `OutboxPublishDLQNonZero` | critical | `octo_outbox_dlq_total > 0` | Inspect DLQ and reprocess manually |
| `OutboxPublisherStalled` | critical | no `octo_outbox_published_total` increase while unpublished rows exist | Restart publisher, inspect Redis connectivity |
| `WebGatewayConsumerLagHigh` | warning | lag > 5s for 5m | Scale web gateway consumers |
| `AuditSinkConsumerLagHigh` | high | lag > 30s for 5m | Scale audit sink / inspect DB |
| `QueueDepthHigh` | high | queue depth > 1000 for 10m | Scale workers or inspect provider outages |
| `QueueDLQNonZero` | critical | DLQ count > 0 | Pause automatic replay and inspect |

---

## 13. Invariants

**I-E1:** BullMQ is for commands of work; Redis Streams is for domain/runtime events. Roles are never inverted.

**I-E2:** No event is published before the commit of the business transaction that created it.

**I-E3:** Redis Streams consumers do not make runtime control decisions. They may project, audit, alert and aggregate metrics only.

**I-E4:** Every event includes `tenant_id`, `trace_id`, `span_id`, `sequence`, `aggregate_type` and `aggregate_id`.

**I-E5:** `sequence` is monotonic per `(tenant_id, aggregate_type, aggregate_id)` and is assigned in PostgreSQL inside the business transaction.

**I-E6:** Every `execution.dispatch` BullMQ job uses `jobId = execution_id`.

**I-E7:** Every consumer is idempotent by `event_id`; duplicate event delivery is treated as normal.

**I-E8:** `XACK` happens only after the consumer has completed its side effect or intentionally dropped the message according to policy.

**I-E9:** Redis Streams retention is not the source of truth. Strong replay comes from PostgreSQL `outbox_events`.

**I-E10:** Outbox publisher may republish the same event after crash; this must not duplicate business state.

**I-E11:** DLQ reprocessing is manual-gated in F1. Automatic DLQ replay is rejected for F1.

**I-E12:** UI receives events through API gateway projection only. It never connects directly to Redis.

**I-E13:** Event payloads must not contain secrets, raw provider credentials or unredacted PII.

**I-E14:** Outbox publisher is a separate worker lifecycle with health checks, metrics and restart policy.

**I-E15:** PostgreSQL remains the system of record. Redis is queue, cache, stream and transient coordination only.

---

## 14. Failure and Recovery Model

| Failure | Expected Result | Recovery |
|---|---|---|
| API commits execution but fails to enqueue dispatch | Execution remains `QUEUED`; reconciler enqueues missing `execution.dispatch` | Queue reconciler scans DB |
| BullMQ dispatch job duplicated | Same `jobId` suppresses duplicate while job exists; CAS prevents duplicate state transition | No-op + structured log |
| Scheduler crashes after CAS before runtime enqueue | Execution is `DISPATCHED`; reconciler enqueues runtime command or retry | Reconciler |
| Runtime crashes after checkpoint commit before event publish | Outbox row remains unpublished; publisher emits after restart | Outbox publisher |
| Outbox publisher crashes after `XADD` before `published_at` update | Event republishes later; consumers dedupe | Consumer dedupe by `event_id` |
| Web gateway consumer crashes before `XACK` | Message remains pending and is reclaimed | `XAUTOCLAIM` + dedupe |
| Audit sink writes then crashes before `XACK` | Event redelivered; durable ledger suppresses duplicate audit row | Consumer ledger |
| Redis Streams trim removes old event | UI falls back to PostgreSQL `outbox_events` for strong replay | DB replay |
| Redis outage during publish | attempt_count increments; after N attempts event goes to publish DLQ | Ops reprocess |
| Poison command job fails repeatedly | BullMQ moves to failed/DLQ; execution transitions according to policy | Ops DLQ manual gate |

---

## 15. Alternatives Rejected

### 15.1 BullMQ as Both Command Queue and Event Bus

Rejected because UI, Ops and audit consumers would become coupled to queue internals and worker lifecycle. BullMQ jobs are work items, not immutable domain facts.

### 15.2 Redis Streams as Both Event Bus and Scheduler

Rejected because scheduling, retry, delay, priority and DLQ semantics become implicit and custom. This would recreate a fragile queue system on top of streams and obscure runtime ownership.

### 15.3 Redis Pub/Sub

Rejected because it lacks durable replay, consumer groups and acknowledgement.

### 15.4 In-Process EventEmitter

Rejected because it is not durable, not distributed and cannot survive process restarts.

### 15.5 Direct Publish After Commit Without Outbox

Rejected because the process can crash between commit and publish, causing permanent event loss.

### 15.6 Kafka + Debezium for F1

Rejected for F1 because it adds operational complexity. Kafka or Debezium may be reconsidered if future event volume, cross-region replication or compliance requirements exceed Redis Streams and polling outbox capacity.

### 15.7 Full Event Sourcing in F1

Rejected because OCTO F1 already has durable state, checkpoints and outbox events. Full event sourcing is unnecessary scope expansion before the runtime kernel is stable.

---

## 16. Consequences

### Positive

- Clear separation between control flow and projection flow.
- Runtime correctness does not depend on UI consumers.
- UI, audit and Ops can consume events independently through consumer groups.
- Outbox prevents phantom events and lost post-commit events.
- PostgreSQL can reconstruct complete timelines even after Redis stream trimming.
- Redis Streams gives near-real-time fan-out without making Redis the durable authority.
- BullMQ remains focused on the job lifecycle: retry, backoff, delay, priority and DLQ.

### Negative

- OCTO operates two Redis-backed messaging models: BullMQ queues and Redis Streams.
- Outbox publisher is an additional worker requiring health checks, deployment and alerting.
- Consumers must be idempotent and handle pending entries correctly.
- Stream lag and queue lag are separate operational concerns.
- The architecture introduces more contracts and tests than a single event emitter.

### Mitigations

- Unified `@octo/events` and `@octo/queue` packages hide implementation details.
- Runbooks define queue DLQ vs outbox DLQ recovery separately.
- CI includes Postgres+Redis integration tests for all invariants.
- Prometheus metrics expose queues, streams, pending entries and outbox health.

---

## 17. Cross-Framework Validation

| Source | Observed Pattern | OCTO F1 Adoption |
|---|---|---|
| n8n | Durable workflow execution uses queue/worker separation and DB-backed execution state. | BullMQ is used for execution commands; PostgreSQL remains source of truth. |
| LangGraph | Durable execution centers on state/checkpoint persistence, not UI event streams as control. | Checkpoints and pending writes are persisted; events are projections from committed state. |
| Flowise | Visual/low-code UX needs runtime state projection and observable execution timelines. | Redis Streams powers UI timeline projection without letting UI control execution. |
| Semantic Kernel | Function/tool calls should be modeled as typed contracts. | Event and command envelopes are typed in TS and Python. |
| Microsoft Agent Framework | Durable workflows and telemetry are separated concerns. | BullMQ/Durable runtime commands are separated from observability events. |
| AutoGen | Modern agent runtimes use asynchronous message passing. | Redis Streams becomes future AgentBus substrate while BullMQ remains scheduler. |
| CrewAI | In-memory task events are useful for callbacks but insufficient for durable distributed execution. | OCTO uses durable outbox + Redis Streams instead of process-local events. |
| Paperclip | Budget/governance systems need separate execution and metrics pipelines. | Ops metrics consume events without controlling runtime. |
| Lattice / AgentNeo / AgenticLens / WorkGraph | Agent systems benefit from graph/timeline visualization and structured logs. | Redis Streams and outbox feed run debugger, topology views and post-mortem export. |
| Rowboat | Durable artifacts and memory require traceable outputs, not only chat responses. | Event envelope carries execution, agent and trace IDs for artifacts/memory links. |
| Microsoft AI Agents for Beginners | Production agents require traces, spans, metrics and cost/performance visibility. | Event stream and OTel attributes are mandatory for F1 runtime observability. |

---

## 18. Validation Test Suite

### 18.1 Integration Tests

| Test | Verification |
|---|---|
| Transaction commit publishes event | Business TX commits with outbox row; publisher emits to `octo.events`. |
| Transaction rollback publishes nothing | TX rolls back; no outbox row and no stream event. |
| Publisher crash after XADD | Same `event_id` appears twice in stream, but consumer side effect occurs once. |
| Consumer crash before XACK | Pending event is reclaimed and processed idempotently. |
| Event ordering per execution | Events for one execution sorted by `sequence` produce correct timeline. |
| Queue job dedupe | Duplicate `execution.dispatch` with same `jobId` does not duplicate DB transition. |
| Queue CAS conflict | Duplicate/stale worker gets rowcount 0 and logs no-op. |
| Outbox DLQ | Redis unavailable for N attempts moves event to `outbox_publish_dlq`. |
| Ops reprocess DLQ | Manual endpoint requeues DLQ row and emits audit log. |
| Tenant projection filter | Web gateway never emits tenant B event to tenant A room. |

### 18.2 Example Jest Test: Rollback Produces No Event

```typescript
describe('ADR-F1-006 outbox transaction integrity', () => {
  it('does not publish events for rolled back transactions', async () => {
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(executions).values(makeExecution());
        await insertOutboxEvent(tx, makeExecutionQueuedEvent());
        throw new Error('force rollback');
      }),
    ).rejects.toThrow('force rollback');

    await outboxPublisher.tick();

    const streamEvents = await redis.xrange('octo.events', '-', '+');
    expect(streamEvents).toHaveLength(0);
  });
});
```

### 18.3 Example Jest Test: Consumer Idempotency

```typescript
it('deduplicates repeated event_id delivery', async () => {
  const event = makeExecutionStartedEvent({ eventId: 'evt_same' });

  await consumer.handle(event);
  await consumer.handle(event);

  expect(projectionStore.countByEventId('evt_same')).resolves.toBe(1);
});
```

### 18.4 Load Test

F1 acceptance load target:

```text
200 executions/hour
13 mandatory events/execution baseline
<= 500ms p95 web-gateway stream lag
0 lost committed events
0 duplicate durable projections per consumer group
```

---

## 19. Operational Runbook

### 19.1 Outbox DLQ Recovery

1. Inspect `outbox_publish_dlq` sorted by `moved_to_dlq_at DESC`.
2. Group by `error_code` and `event_type`.
3. Verify Redis health and stream connectivity.
4. Select specific DLQ rows for reprocess.
5. Call `POST /v1/ops/outbox-dlq/reprocess` with manual approval.
6. Confirm `reprocessed_at` and `published_at` are set.
7. Verify `octo_outbox_dlq_total` returns to zero or is acknowledged.

### 19.2 Stream Consumer Lag

1. Check `XINFO GROUPS octo.events`.
2. Identify consumer group with high `lag` or `pending`.
3. Inspect service logs for that consumer.
4. Scale consumer replicas if CPU-bound.
5. Use `XAUTOCLAIM` for stale pending entries if a consumer died.
6. Validate dedupe metrics after recovery.

### 19.3 Queue DLQ Recovery

1. Inspect BullMQ failed jobs in BullBoard/Ops UI.
2. Confirm failure signature and whether retry is safe.
3. If state transition already committed, do not replay blindly; rely on CAS/no-op behavior.
4. Requeue through `ops.dlq.reprocess` only after approval.
5. Capture audit event `OpsDlqReprocessRequested` in later phases.

---

## 20. Exit Criteria Integration

ADR-F1-006 is blocking for F1 STABLE.

F1 cannot be declared stable unless:

- `outbox_events` and `outbox_publish_dlq` migrations exist and pass in CI.
- `@octo/events` exports TS contracts and Python-compatible schemas.
- BullMQ command queues are separated from Redis Streams consumers.
- No Redis Streams consumer performs runtime control transitions.
- Outbox publisher has health check, metrics and restart policy.
- All mandatory F1 events are emitted from committed transitions.
- Integration tests prove rollback, crash, dedupe, ordering and DLQ behavior.
- Web gateway projection enforces tenant scope.
- Ops dashboard exposes queue depth, stream lag and outbox DLQ metrics.

---

## 21. Related ADRs

| ADR | Relationship |
|---|---|
| ADR-F1-001 — Durable Execution Semantics | Commands drive durable execution transitions; events project committed facts. |
| ADR-F1-002 — Replay Semantics and Determinism Rules | Replay uses checkpoints and persisted outputs, not Redis stream state. |
| ADR-F1-003 — Checkpoint Persistence Model and Lineage Validation | Checkpoint commits produce `ExecutionCheckpointed` events through outbox. |
| ADR-F1-004 — LiteLLM Abstraction Boundary and Provider Routing | LLM calls emit runtime events and metrics but do not control queue topology. |
| ADR-F1-005 — Tenant Isolation, JWT Claims and PostgreSQL RLS | Events carry `tenant_id`; outbox and projections enforce tenant isolation. |

---

## 22. References

- Issue: [lssmanager/OCTO#99 — F1-ADR-006 Event Bus Split](https://github.com/lssmanager/OCTO/issues/99)
- BullMQ Docs: [Job IDs](https://docs.bullmq.io/guide/jobs/job-ids)
- BullMQ Docs: [Retrying failing jobs](https://docs.bullmq.io/guide/retrying-failing-jobs)
- Redis Docs: [Streams](https://redis.io/docs/latest/develop/data-types/streams/)
- Microsoft AI Agents for Beginners: [Agentes de IA en Producción: Observabilidad y Evaluación](https://microsoft.github.io/ai-agents-for-beginners/translations/es/10-ai-agents-production/)
- OCTO Architecture: Event-Driven Architecture, Observability First, PostgreSQL as System of Record
- F0 Foundation: BullMQ, write-before-ack, DLQ, observability, queue reliability
- F1 Runtime: `RedisStreamEventBus`, outbox publisher, command queue topology, durable execution flow

---

**Status Change:** This ADR moves from Proposed to Accepted. The split between BullMQ commands and Redis Streams events is mandatory for F1 complete. It prevents the event bus from becoming a hidden scheduler, preserves PostgreSQL as the source of truth, and provides the projection substrate needed for UI timelines, audit, Ops metrics and future agent-to-agent messaging without compromising durable execution correctness.
