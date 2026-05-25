# DLQ Growth

## Trigger
`OctoDLQGrowthCritical` or `OctoQueueDLQGrowing`.

## Steps
1. Query `GET /v1/ops/dlq` and confirm affected queue/volume.
2. Group failed jobs by `error_code`/signature to isolate poison pattern.
3. Inspect execution timeline and correlated deploy/config changes.
4. Verify workers are not reprocessing the same poisoned payload loop.
5. Remediate root cause before any requeue.
6. Requeue with `POST /v1/ops/dlq/:jobId/requeue` and include incident reason.
7. **Never mutate Redis keys manually** for runtime transitions.
