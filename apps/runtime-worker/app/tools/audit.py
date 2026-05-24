from __future__ import annotations

from typing import Any


class ToolAuditService:
    def __init__(self) -> None:
        self.events: list[dict[str, Any]] = []

    async def emit(self, event_name: str, payload: dict[str, Any]) -> None:
        self.events.append({"event": event_name, **payload})
