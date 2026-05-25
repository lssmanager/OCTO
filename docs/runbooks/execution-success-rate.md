# Execution Success Rate Low

## Trigger
`OctoExecutionSuccessRateLow`.

## Steps
1. Segment failures by stage (dispatch, tool, LLM, checkpoint, outbox).
2. Correlate with deploys/infra incidents in same time window.
3. Prioritize top failing error codes and remediate.
4. Validate retries and reclaim paths are converging.
5. Close after sustained success-rate recovery.
