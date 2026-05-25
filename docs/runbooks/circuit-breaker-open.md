# Circuit Breaker Open

## Trigger
`OctoCircuitBreakerOpen`.

## Steps
1. Identify provider/model circuit currently open.
2. Confirm root cause (timeouts, 5xx burst, auth/rate-limit failure).
3. Validate fallback provider path is operating.
4. Avoid forced close unless mitigation is in place.
5. Close incident only after breaker remains stable and error budget recovers.
