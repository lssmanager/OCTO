# Outbox Publish Failed

## Trigger
`OctoOutboxPublishFailed`.

## Steps
1. Inspect outbox pending/failed counters and event types.
2. Validate broker connectivity and publisher auth.
3. Check idempotency keys and duplicate publish handling.
4. Replay failed outbox rows through supported publisher workflow.
5. Confirm event-plane catches up with durable outbox truth.
