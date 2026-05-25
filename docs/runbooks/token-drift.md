# Token Accounting Drift

## Trigger
`OctoTokenAccountingDrift`.

## Steps
1. Compare `octo_litellm_tokens_output_total` vs persisted exporter metric.
2. Validate persisted `execution_steps.metadata_json.llm_call.output_tokens` quality.
3. Check for missing usage fields/provider accounting errors in adapter paths.
4. Review fallback/streaming branches for dropped accounting events.
5. Verify prompt caching and retries are accounted once (no double/zero count).
