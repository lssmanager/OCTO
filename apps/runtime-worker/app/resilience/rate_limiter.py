from __future__ import annotations

import re
import time


_BUCKET_SCRIPT = """
local token_key = KEYS[1]
local last_key = KEYS[2]
local now = tonumber(ARGV[1])
local capacity = tonumber(ARGV[2])
local refill = tonumber(ARGV[3])
local needed = tonumber(ARGV[4])
local ttl = tonumber(ARGV[5])

local tokens = tonumber(redis.call('GET', token_key))
if tokens == nil then
  tokens = capacity
end

local last = tonumber(redis.call('GET', last_key))
if last == nil then
  last = now
end

tokens = math.min(capacity, tokens + math.max(0, now - last) * refill)
if tokens < needed then
  redis.call('SET', token_key, tokens, 'EX', ttl)
  redis.call('SET', last_key, now, 'EX', ttl)
  return 0
end

tokens = tokens - needed
redis.call('SET', token_key, tokens, 'EX', ttl)
redis.call('SET', last_key, now, 'EX', ttl)
return 1
"""


class TokenBucketRateLimiter:
    def __init__(self, redis: object, metrics: object | None = None, logger: object | None = None) -> None:
        self.redis = redis
        self.metrics = metrics
        self.logger = logger

    def _mk(self, tenant_id: str, model: str, name: str) -> str:
        sm = re.sub(r"[^a-zA-Z0-9_.-]", "_", model)
        st = re.sub(r"[^a-zA-Z0-9_.-]", "_", tenant_id)
        return f"octo:{st}:rl:{sm}:{name}"

    async def acquire(
        self,
        tenant_id: str,
        model: str,
        tokens_needed: int,
        capacity: int,
        refill_rate_per_second: float,
    ) -> bool:
        tk = self._mk(tenant_id, model, "tokens")
        lk = self._mk(tenant_id, model, "last_refill")
        now = time.time()
        eval_fn = getattr(self.redis, "eval", None)
        if eval_fn is None:
            if self.logger is not None:
                self.logger.error("rate_limiter_non_atomic_backend")
            if self.metrics is not None:
                self.metrics.increment("octo_rate_limiter_fail_closed_total", {"reason": "missing_eval"})
            return False
        try:
            result = await eval_fn(
                _BUCKET_SCRIPT,
                2,
                tk,
                lk,
                now,
                capacity,
                refill_rate_per_second,
                tokens_needed,
                120,
            )
        except Exception:
            if self.logger is not None:
                self.logger.exception("rate_limiter_atomic_eval_failed")
            if self.metrics is not None:
                self.metrics.increment("octo_rate_limiter_fail_closed_total", {"reason": "eval_failed"})
            return False
        return bool(int(result))
