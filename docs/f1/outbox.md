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
