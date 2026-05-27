# ADR: F1 Outbox Publication

## Status

Accepted

## Context

F1 needs durable and observable execution events. Persisting rows in `outbox_events` is not sufficient unless publication is operationally closed end-to-end.

## Decision

- `outbox_events` remains the durable source for integration events.
- Event state and outbox insertion must be transactional for the same logical state change.
- The publisher uses at-least-once semantics:
  - claim unpublished rows
  - publish to Redis stream sink (`octo.events`)
  - mark row published only after successful sink acknowledgment
  - record failures and move exhausted rows to DLQ.
- Tests must first validate semantics with a fake event bus abstraction before wiring broker specifics.

## Guarantees

- At-least-once publication.
- Idempotent consumption by `eventId` and/or `idempotencyKey`.
- Retry with bounded attempts.
- Traceability by `execution_id` (aggregate id) and `event_id`.

## Not guaranteed

- Global exactly-once.
- Global ordering across different executions.
