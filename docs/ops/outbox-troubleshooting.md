# Outbox Troubleshooting (F1)

## Trace a single execution

1. Find `execution_id` in execution logs/API.
2. Query outbox rows with matching aggregate id.
3. Check publication fields (`published_at`, `publish_attempts`, `last_error`).
4. Search publisher logs with `event_id` and `execution_id`.
5. Confirm sink-side receipt/processing by `event_id`.

## Quick SQL

```sql
select id, event_type, aggregate_id, published_at, publish_attempts, last_error
from outbox_events
where aggregate_id = $1
order by created_at asc;
```
