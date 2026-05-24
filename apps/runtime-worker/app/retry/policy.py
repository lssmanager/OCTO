from __future__ import annotations

import random
from enum import StrEnum
from typing import Callable

from pydantic import BaseModel, Field, field_validator


class ErrorClass(StrEnum):
    PROVIDER_TRANSIENT = 'PROVIDER_TRANSIENT'
    PROVIDER_RATE_LIMIT = 'PROVIDER_RATE_LIMIT'
    TOOL_TRANSIENT = 'TOOL_TRANSIENT'
    TOOL_TIMEOUT = 'TOOL_TIMEOUT'
    RUNTIME_TRANSIENT = 'RUNTIME_TRANSIENT'
    INVARIANT_BREACH = 'INVARIANT_BREACH'
    BUDGET_EXCEEDED = 'BUDGET_EXCEEDED'
    TERMINAL = 'TERMINAL'
    POISON = 'POISON'


class RetryPolicy(BaseModel):
    max_attempts: int = Field(ge=1)
    backoff_base_ms: int = Field(ge=0)
    backoff_multiplier: float = Field(default=2.0, ge=1.0)
    jitter_factor: float = Field(default=0.25, ge=0.0, le=1.0)
    max_backoff_ms: int = Field(ge=0)

    @field_validator('max_backoff_ms')
    @classmethod
    def validate_backoff_bounds(cls, value: int, info):
        base = info.data.get('backoff_base_ms', 0)
        if value < base:
            raise ValueError('max_backoff_ms must be >= backoff_base_ms')
        return value


RETRY_POLICIES = {
    'provider': RetryPolicy(max_attempts=3, backoff_base_ms=2000, max_backoff_ms=30000),
    'tool': RetryPolicy(max_attempts=2, backoff_base_ms=5000, max_backoff_ms=20000),
    'runtime': RetryPolicy(max_attempts=2, backoff_base_ms=1000, max_backoff_ms=5000),
    'reclaim': RetryPolicy(max_attempts=3, backoff_base_ms=3000, max_backoff_ms=15000),
}

RETRYABLE_CLASSES = {
    ErrorClass.PROVIDER_TRANSIENT,
    ErrorClass.PROVIDER_RATE_LIMIT,
    ErrorClass.TOOL_TRANSIENT,
    ErrorClass.TOOL_TIMEOUT,
    ErrorClass.RUNTIME_TRANSIENT,
}


def compute_backoff_ms(policy: RetryPolicy, attempt: int, rng: Callable[[], float] | None = None) -> int:
    if attempt < 1:
        raise ValueError('attempt must be >= 1')
    random_fn = rng or random.random
    base = policy.backoff_base_ms * (policy.backoff_multiplier ** (attempt - 1))
    capped = min(base, policy.max_backoff_ms)
    jitter = capped * policy.jitter_factor * random_fn()
    return int(capped + jitter)


def should_retry(scope: str, attempt: int, error_class: ErrorClass) -> bool:
    policy = RETRY_POLICIES.get(scope)
    if policy is None:
        return False
    if error_class not in RETRYABLE_CLASSES:
        return False
    return attempt <= policy.max_attempts
