# F1 Outbox Operational Flow

## Inventory (current repository state)

| Area | File | Current state | Gap |
|---|---|---|---|
| DB schema | `packages/database/src/schema/outbox-events.ts` | `publishedAt`, `publishAttempts`, `lastError`, unpublished indexes exist | No explicit processing-lock columns in this table version |
| Durable writes | `apps/api/src/execution/postgres-execution.repo.ts`, `apps/scheduler-worker/src/dispatch-handler.ts` | Execution-related rows write to `outbox_events` | Coverage is event-type specific; ensure all terminal transitions emit as required |
| Publisher core | `packages/events/src/outbox-publisher.ts` | Implements publish batch, failure tracking, DLQ routing, metrics hooks | Needs app-level wiring and replay/stuck-recovery runbook discipline |
| Fake-bus proof | `apps/api/src/outbox/outbox-publisher.service.spec.ts` | Happy/failure semantics proven against fake bus | Does not replace broker integration/integration test coverage |
| Stream codec | `packages/events/src/redis-stream-contract.ts`, `packages/events/src/redis-stream-parser.ts` | Canonical field mapping for redis stream payload | Consumers must preserve idempotency semantics |
| Ops runbook | `docs/runbooks/outbox-publish-failed.md` | Failure triage guidance exists | Needs end-to-end trace checklist with execution id + event id in one place |

## Operational flow

1. State transition writes domain row(s) and outbox row in same transaction.
2. Publisher claims unpublished rows.
3. Publisher sends envelope to `octo.events` stream.
4. On ack, publisher marks row published.
5. On failure, publisher records attempt/error; exhausted attempts move to DLQ.

## Traceability

To trace one execution event:

1. Resolve `execution_id`.
2. Query `outbox_events` by `aggregate_id = execution_id`.
3. Inspect `published_at`, `publish_attempts`, `last_error`.
4. Correlate with publisher logs by `event_id`.

## Issue #337 hardening notes

The F1 outbox publisher treats PostgreSQL `outbox_events` as the source of truth and Redis Streams as the event-bus projection. A malformed event or a sequence gap must not freeze the aggregate or the whole batch: the publisher records the per-event failure, increments attempts, routes exhausted rows to `outbox_publish_dlq`, and continues with later rows when their envelopes are valid and independently publishable.

All publisher writes back to tenant-scoped tables (`outbox_events` publish/failure state and `outbox_publish_dlq`) must execute inside a transaction that sets `app.current_tenant` for the affected row tenant. RLS remains the final isolation boundary; DLQ rows retain `tenant_id` and a tenant-scoped reference to their source outbox event for traceability.

Redis consumer groups for `octo.events` are created at stream id `0`, not `$`, so a newly-created group on an already-populated stream replays persisted events instead of silently starting at the tail. Consumers must keep idempotency by `tenant_id` + `event_id`.
