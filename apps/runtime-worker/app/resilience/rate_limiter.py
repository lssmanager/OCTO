from __future__ import annotations

import re
import time


class TokenBucketRateLimiter:
    def __init__(self, redis: object, metrics: object | None = None, logger: object | None = None) -> None:
        self.redis = redis
        self.metrics = metrics
        self.logger = logger

    def _mk(self, tenant_id: str, model: str, name: str) -> str:
        sm = re.sub(r"[^a-zA-Z0-9_.-]", "_", model)
        return f"octo:{tenant_id}:rl:{sm}:{name}"

    async def acquire(self, tenant_id: str, model: str, tokens_needed: int, capacity: int, refill_rate_per_second: float) -> bool:
        tk = self._mk(tenant_id, model, "tokens")
        lk = self._mk(tenant_id, model, "last_refill")
        now = time.time()
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
