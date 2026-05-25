# Worker Heartbeat Stale

## Trigger
`OctoWorkerHeartbeatStale`.

## Steps
1. Confirm active executions (`octo_execution_active_gauge > 0`).
2. Identify stale workers by heartbeat age and process health.
3. Check queue lag and worker connectivity/runtime saturation.
4. Restart or replace unhealthy workers and monitor reclaim side-effects.
5. During planned maintenance, temporary silence is allowed with reason and end time.
