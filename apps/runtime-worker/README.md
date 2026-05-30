# OCTO Runtime Worker

Python / FastAPI — **AI Execution Plane** (isolated from Control Plane)

## Responsibilities

- Task execution
- Tool execution
- LLM interaction (via LiteLLM)
- Reasoning and planning
- Memory retrieval
- Runtime operations
- F1 durable progress persistence using the explicit Runtime Worker PostgreSQL write contract

## Boundary

F1 runtime-worker is a direct PostgreSQL writer for durable execution progress.
`DATABASE_URL` is required for execution, not only for health checks. The allowed
F1 write surface is: `executions`, `execution_steps`, `execution_checkpoints`,
`execution_checkpoint_writes`, `tool_invocations`, `approvals`, `outbox_events`
and `worker_heartbeats`. Control Plane still owns user-facing orchestration APIs,
authz/policy, dispatch and scheduling. F2+ should move this direct persistence
behind event-sourcing, a Control Plane API or a persistence adapter.

## Forbidden

- Business orchestration logic
- UI logic
- Broad persistence authority outside the F1 write contract above
- Approval policy ownership
- Scheduling

## Setup

```bash
cd apps/runtime-worker
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn src.main:app --reload --port 8001
```
