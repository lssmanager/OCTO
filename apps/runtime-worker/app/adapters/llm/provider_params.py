from __future__ import annotations

from typing import Any

ALLOWED_PROVIDER_PARAMS = {
    "top_p",
    "presence_penalty",
    "frequency_penalty",
    "seed",
    "response_format",
    "stop",
}


def allowlisted_provider_params(provider_params: dict[str, Any] | None) -> dict[str, Any]:
    if not provider_params:
        return {}
    return {k: v for k, v in provider_params.items() if k in ALLOWED_PROVIDER_PARAMS}
