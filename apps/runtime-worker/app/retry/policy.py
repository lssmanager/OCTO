from dataclasses import dataclass
import random

@dataclass
class RetryPolicy: max_attempts:int; base_backoff_ms:int; max_backoff_ms:int
RETRY_POLICIES={'provider':RetryPolicy(3,2000,30000),'tool':RetryPolicy(2,5000,20000),'runtime':RetryPolicy(2,1000,5000),'reclaim':RetryPolicy(3,3000,15000)}
def compute_backoff_ms(policy: RetryPolicy, attempt: int, jitter_factor: float = 0.25, rng=random.random):
    raw=min(policy.base_backoff_ms*(2**max(attempt-1,0)),policy.max_backoff_ms)
    return min(int(raw*(1+jitter_factor*rng())), policy.max_backoff_ms)
