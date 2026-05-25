"""Models router — lista los modelos LLM disponibles via LiteLLM.

F0: lista estática de modelos conocidos.
F2: consulta dinámica al LiteLLM proxy /models endpoint.
"""
from __future__ import annotations

import os
import structlog
from fastapi import APIRouter, Header, HTTPException, status

from ..schemas.models import ModelInfo

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/models", tags=["models"])

# F0: lista estática. F2: GET {litellm_url}/models
_F0_MODELS: list[ModelInfo] = [
    ModelInfo(
        id="gpt-4o-mini",
        provider="openai",
        context_window=128_000,
        supports_function_calling=True,
        supports_streaming=True,
    ),
    ModelInfo(
        id="gpt-4o",
        provider="openai",
        context_window=128_000,
        supports_function_calling=True,
        supports_streaming=True,
    ),
    ModelInfo(
        id="anthropic/claude-3-5-haiku-20241022",
        provider="anthropic",
        context_window=200_000,
        supports_function_calling=True,
        supports_streaming=True,
    ),
    ModelInfo(
        id="anthropic/claude-3-5-sonnet-20241022",
        provider="anthropic",
        context_window=200_000,
        supports_function_calling=True,
        supports_streaming=True,
    ),
    ModelInfo(
        id="groq/llama-3.3-70b-versatile",
        provider="groq",
        context_window=128_000,
        supports_function_calling=True,
        supports_streaming=True,
    ),
]


@router.get(
    "/",
    response_model=list[ModelInfo],
    summary="List available LLM models",
    description="F0: lista estática. F2: dinámica via LiteLLM proxy.",
)
async def list_models(x_internal_secret: str | None = Header(default=None, alias="X-Internal-Secret")) -> list[ModelInfo]:
    expected_secret = os.getenv("API_INTERNAL_SECRET")
    if not expected_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Service misconfigured: API_INTERNAL_SECRET not set",
        )
    if not x_internal_secret or x_internal_secret != expected_secret:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or invalid X-Internal-Secret header",
        )

    log.info("models.list", count=len(_F0_MODELS))
    return _F0_MODELS
