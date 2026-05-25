# Tool Timeout Rate High

## Trigger
`OctoToolTimeoutRateHigh`.

## Steps
1. Identify top timing-out tools and dependency endpoints.
2. Validate sandbox/runtime limits and network egress health.
3. Tune timeout/retry budget to avoid cascade failures.
4. Apply per-tool backpressure or circuiting if required.
5. Verify timeout ratio returns below threshold.
