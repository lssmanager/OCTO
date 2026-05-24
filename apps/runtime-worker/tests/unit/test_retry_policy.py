from app.retry.policy import RETRY_POLICIES, compute_backoff_ms

def test_backoff_capped():
    p=RETRY_POLICIES['provider']
    value=compute_backoff_ms(p, 20, jitter_factor=0.0)
    assert value==p.max_backoff_ms
