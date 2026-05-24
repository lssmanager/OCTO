from __future__ import annotations

from app.adapters.llm.base import LLMCanonicalError


def map_http_error(status_code: int, message: str, *, provider: str | None = None, model: str | None = None) -> LLMCanonicalError:
    if status_code == 429:
        return LLMCanonicalError("LLM_RATE_LIMITED", message, True, provider, model, status_code)
    if status_code in {408, 504}:
        return LLMCanonicalError("LLM_TIMEOUT", message, True, provider, model, status_code)
    if status_code >= 500:
        return LLMCanonicalError("LLM_PROVIDER_UNAVAILABLE", message, True, provider, model, status_code)
    if status_code in {401, 403}:
        return LLMCanonicalError("LLM_PROVIDER_AUTH_FAILED", message, False, provider, model, status_code)
    if status_code == 404:
        return LLMCanonicalError("LLM_MODEL_NOT_ALLOWED", message, False, provider, model, status_code)
    return LLMCanonicalError("LLM_BAD_REQUEST", message, False, provider, model, status_code)
