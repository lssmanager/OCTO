"""OCTO Runtime Worker — AI Execution Plane

This worker is ISOLATED from the Control Plane.
It handles ONLY: task execution, tool execution, LLM interaction,
reasoning, planning, memory retrieval, and runtime operations.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import Settings
from .routers import health

settings = Settings()

app = FastAPI(
    title="OCTO Runtime Worker",
    description="AI Execution Plane — isolated from Control Plane",
    version="0.0.1",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.api_url],
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(health.router)


@app.on_event("startup")
async def startup_event() -> None:
    print(f"OCTO Runtime Worker starting on port {settings.port}")
