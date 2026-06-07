from __future__ import annotations

import pytest

from app.resilience.rate_limiter import TokenBucketRateLimiter


class NoEvalRedis:
    async def get(self, key):
        return None

    async def set(self, *args, **kwargs):
        return True


class EvalRedis:
    def __init__(self, result=1, fail=False):
        self.calls = []
        self.result = result
        self.fail = fail

    async def eval(self, *args):
        self.calls.append(args)
        if self.fail:
            raise RuntimeError("nope")
        return self.result


@pytest.mark.asyncio
async def test_rate_limiter_uses_atomic_eval() -> None:
    redis = EvalRedis(result=1)
    assert await TokenBucketRateLimiter(redis).acquire("tenant", "openai/gpt", 1, 10, 1.0) is True
    assert redis.calls


@pytest.mark.asyncio
async def test_rate_limiter_fails_closed_without_eval() -> None:
    assert await TokenBucketRateLimiter(NoEvalRedis()).acquire("tenant", "openai/gpt", 1, 10, 1.0) is False


@pytest.mark.asyncio
async def test_rate_limiter_fails_closed_when_eval_fails() -> None:
    assert await TokenBucketRateLimiter(EvalRedis(fail=True)).acquire("tenant", "openai/gpt", 1, 10, 1.0) is False
