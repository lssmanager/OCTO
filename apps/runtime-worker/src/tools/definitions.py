from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Literal

@dataclass
class ToolDefinition:
    name: str
    kind: Literal['builtin_sync','builtin_async']
    description: str
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    timeout_ms: int = 5000
    retryable: bool = True
    side_effect_level: Literal['none','low','high'] = 'none'
    enabled: bool = True
