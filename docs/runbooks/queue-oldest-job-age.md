# Queue Oldest Job Age

## Trigger
`OctoQueueOldestJobAge`.

## Steps
1. Confirm queue `execution.dispatch` oldest age and depth.
2. Verify dispatch workers and concurrency limits.
3. Check blocking dependency (DB, provider, network).
4. Scale workers or reduce inflow if saturation confirmed.
5. Planned-maintenance silence allowed only with reason + end time.
