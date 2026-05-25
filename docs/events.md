# F1 Events Architecture

## Durable source of truth
PostgreSQL is the only source of truth. Producers write domain state + `outbox_events` in the same transaction.

## Outbox flow
1. API/runtime/scheduler mutate durable state.
2. Same transaction inserts outbox row with envelope metadata.
3. Dedicated outbox publisher polls unpublished rows.
4. Publisher `XADD`s to `octo.events`.
5. Publisher marks `published_at`.

## EventEnvelope
Required fields: `eventId`, `eventType`, `tenantId`, `aggregateType`, `aggregateId`, `sequence`, `traceId`, `spanId`, `occurredAt`, `schemaVersion="1.0"`, and `payload`.

## Redis stream fields
`id`, `type`, `tenant_id`, `aggregate`, `aggregate_type`, `aggregate_id`, `sequence`, `trace_id`, `span_id`, `occurred_at`, `schema_version`, `payload`.

## Consumer groups
- `octo.events.websocket`
- `octo.events.ops`
- `octo.events.audit`

Created with `XGROUP CREATE octo.events <group> $ MKSTREAM`; `BUSYGROUP` is treated as success.

## Dedupe / idempotency
Use `SET octo:{tenantId}:evt:processed:{eventId} 1 EX 3600 NX`.
Only process when `OK`; duplicates are acked and skipped.

## DLQ
After max publish attempts, rows are moved to `outbox_publish_dlq` for operator reprocessing.

## OTel propagation
Build `traceparent` as `00-{traceId}-{spanId}-01`; consumers extract and create `process_event` child span with event attributes.
