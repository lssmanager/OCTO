# LiteLLM 5xx/Error Rate High

## Trigger
`OctoLiteLLM5xxHigh`.

## Steps
1. Identify affected provider/model labels and error class.
2. Validate upstream provider health and gateway rate limits.
3. Check circuit breaker state and fallback routing behavior.
4. Reduce load / shift traffic to healthy providers if needed.
5. Track recovery until error ratio drops below threshold for sustained period.
