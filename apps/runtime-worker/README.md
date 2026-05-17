# OCTO Runtime Worker

Python / FastAPI — **AI Execution Plane** (isolated from Control Plane)

## Responsibilities

- Task execution
- Tool execution
- LLM interaction (via LiteLLM)
- Reasoning and planning
- Memory retrieval
- Runtime operations

## Forbidden

- Business orchestration logic
- UI logic
- Persistence authority (writes go through Control Plane events)
- Approval logic
- Scheduling

## Setup

```bash
cd apps/runtime-worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8001
```
