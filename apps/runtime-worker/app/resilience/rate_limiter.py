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
        return f"octo:{tenant_id}:rl:{sm}:{name}"

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
        if hasattr(self.redis, "eval"):
            result = await self.redis.eval(
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
            return bool(int(result))

        tokens_raw = await self.redis.get(tk)
        last_raw = await self.redis.get(lk)
        tokens = float(tokens_raw) if tokens_raw is not None else float(capacity)
        last = float(last_raw) if last_raw is not None else now
        tokens = min(float(capacity), tokens + (now - last) * refill_rate_per_second)
        if tokens < tokens_needed:
            await self.redis.set(tk, tokens, ex=120)
            await self.redis.set(lk, now, ex=120)
            return False
        tokens -= tokens_needed
        await self.redis.set(tk, tokens, ex=120)
        await self.redis.set(lk, now, ex=120)
        return True
