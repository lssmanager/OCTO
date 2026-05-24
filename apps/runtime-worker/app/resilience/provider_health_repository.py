from __future__ import annotations

import json
import re
from datetime import UTC, datetime


class ProviderHealthRepository:
    def __init__(self, redis: object) -> None:
        self.redis = redis

    def _k(self, tenant_id: str, provider: str, model: str) -> str:
        p = re.sub(r"[^a-zA-Z0-9_.-]", "_", provider)
        m = re.sub(r"[^a-zA-Z0-9_.-]", "_", model)
        return f"octo:{tenant_id}:provider_health:{p}:{m}"

    async def put(self, tenant_id: str, provider: str, model: str, snapshot: dict) -> None:
        payload = dict(snapshot)
        payload["updated_at"] = datetime.now(UTC).isoformat()
        await self.redis.set(self._k(tenant_id, provider, model), json.dumps(payload), ex=120)

    async def get(self, tenant_id: str, provider: str, model: str) -> dict | None:
        raw = await self.redis.get(self._k(tenant_id, provider, model))
        return json.loads(raw) if raw else None
