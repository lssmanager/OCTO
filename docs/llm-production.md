# OCTO LLM Production Operations

## LiteLLM Proxy
- Deploy LiteLLM as HA service behind internal LB.
- Use `drop_params: true`, `telemetry: false`, `master_key` rotation.
- Runtime worker calls only LiteLLM proxy.

## HA and health
- Minimum 2 replicas.
- Liveness: `/health/liveliness`.
- Readiness: `/health/readiness`.

## Security
- Store provider keys in secret manager only.
- Never log keys or raw prompts.

## Troubleshooting
- 429 spikes: inspect rate limiter + fallback metrics.
- 5xx spikes: inspect circuit breaker state and provider health worker.
