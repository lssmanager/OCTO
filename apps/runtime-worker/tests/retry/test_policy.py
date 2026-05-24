import pytest
from pydantic import ValidationError

from app.retry.policy import ErrorClass, RetryPolicy, compute_backoff_ms, should_retry


def test_valid_retry_policy_parses() -> None:
    p = RetryPolicy(max_attempts=1, backoff_base_ms=0, max_backoff_ms=10)
    assert p.max_attempts == 1


def test_invalid_max_attempts_fails() -> None:
    with pytest.raises(ValidationError):
        RetryPolicy(max_attempts=0, backoff_base_ms=1, max_backoff_ms=1)


def test_invalid_jitter_factor_fails() -> None:
    with pytest.raises(ValidationError):
        RetryPolicy(max_attempts=1, backoff_base_ms=1, max_backoff_ms=2, jitter_factor=1.2)


def test_compute_backoff_attempt_1_expected_base() -> None:
    p = RetryPolicy(max_attempts=3, backoff_base_ms=1000, max_backoff_ms=5000, jitter_factor=0)
    assert compute_backoff_ms(p, 1, rng=lambda: 0) == 1000


def test_compute_backoff_exponential_growth() -> None:
    p = RetryPolicy(max_attempts=3, backoff_base_ms=1000, max_backoff_ms=5000, jitter_factor=0)
    assert compute_backoff_ms(p, 2, rng=lambda: 0) == 2000


def test_compute_backoff_caps_at_max_backoff() -> None:
    p = RetryPolicy(max_attempts=10, backoff_base_ms=1000, max_backoff_ms=1500, jitter_factor=0)
    assert compute_backoff_ms(p, 4, rng=lambda: 0) == 1500


def test_compute_backoff_jitter_range() -> None:
    p = RetryPolicy(max_attempts=3, backoff_base_ms=1000, max_backoff_ms=1000, jitter_factor=0.25)
    value = compute_backoff_ms(p, 1, rng=lambda: 1.0)
    assert 1000 <= value <= 1250


def test_attempt_less_than_1_raises() -> None:
    with pytest.raises(ValueError):
        compute_backoff_ms(RetryPolicy(max_attempts=1, backoff_base_ms=1, max_backoff_ms=1), 0)


def test_should_retry_true_for_retryable_class() -> None:
    assert should_retry('provider', 1, ErrorClass.PROVIDER_TRANSIENT)


def test_should_retry_false_for_non_retryable_class() -> None:
    assert not should_retry('provider', 1, ErrorClass.TERMINAL)


def test_should_retry_false_after_max_attempts() -> None:
    assert not should_retry('provider', 4, ErrorClass.PROVIDER_TRANSIENT)
