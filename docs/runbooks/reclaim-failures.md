# Reclaim Failures

## Trigger
`OctoReclaimRateLow` or `OctoCheckpointRecoveryFailed`.

## Steps
1. Check stale/runnable executions in PostgreSQL durable state.
2. Verify worker heartbeat freshness and lease expiry distribution.
3. Validate checkpoint lineage/schema integrity and replay compatibility.
4. Inspect `CHECKPOINT_INVALID` failures and schema drift incidents.
5. Perform manual reclaim only via supported ops endpoint, never direct Redis edits.
