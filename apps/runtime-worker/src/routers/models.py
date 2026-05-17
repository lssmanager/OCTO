"""Models router — proxy to LiteLLM /models endpoint.

Exposes the list of available LLM models registered in the LiteLLM proxy
to the Control Plane. The Control Plane uses this to populate model
selectors in the UI and validate LLMConfig.primary at agent creation time.
"""
import structlog
from fastapi import APIRouter, HTTPException, status

import httpx

from ..config import Settings
from ..schemas import ModelInfo

log = structlog.get_logger(__name__)
router = APIRouter(prefix="/models", tags=["models"])
_settings = Settings()


@router.get(
    "/",
    response_model=list[ModelInfo],
    summary="List available LLM models",
    description="Proxies to the LiteLLM /models endpoint and returns typed model info.",
)
async def list_models() -> list[ModelInfo]:
    """Return all models available through the LiteLLM proxy."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                f"{_settings.litellm_url}/models",
                headers={"Authorization": f"Bearer {_settings.litellm_api_key}"},
            )
            resp.raise_for_status()
            data = resp.json()
    except httpx.HTTPError as exc:
        log.warning("models.litellm_unavailable", error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LiteLLM proxy unreachable: {exc}",
        ) from exc

    models: list[ModelInfo] = []
    for item in data.get("data", []):
        try:
            models.append(
                ModelInfo(
                    id=item["id"],
                    provider=item.get("owned_by", "unknown"),
                    context_window=item.get("context_window"),
                    supports_function_calling=item.get("supports_function_calling", False),
                    supports_streaming=item.get("supports_streaming", True),
                )
            )
        except Exception as exc:  # noqa: BLE001
            log.warning("models.parse_error", item=item, error=str(exc))

    log.info("models.listed", count=len(models))
    return models
