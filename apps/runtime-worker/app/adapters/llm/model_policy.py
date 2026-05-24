from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel


class BudgetPolicySnapshot(BaseModel):
    max_usd_per_run: Decimal | None = None
    min_reserved_cost_usd: Decimal = Decimal("0.000001")
    on_exhaust: Literal["fail", "pause_for_approval"] = "fail"


def is_fallback_eligible(error_code: str) -> bool:
    return error_code in {
        "LLM_RATE_LIMITED",
        "LLM_TIMEOUT",
        "LLM_PROVIDER_UNAVAILABLE",
        "LLM_CIRCUIT_OPEN",
    }
