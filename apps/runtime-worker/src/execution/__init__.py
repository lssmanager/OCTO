"""OCTO Runtime Worker — durable execution utilities (F1 current state).

Public API for the execution module. Import from here, not from submodules.

Architectural notes (F1 current behavior):
  - PostgreSQL is the durable system of record for execution state.
  - Runtime components in this repository do perform direct execution-state
    writes in F1 (for status transitions, steps, checkpoints and recovery).
  - Redis is used for queueing/transient coordination.
  - Executions must survive container restarts via durable checkpointing.

Future direction (F2+):
  - Narrower write boundaries or event-only persistence are future design
    targets and must not be assumed as current behavior.
"""
from .checkpoint import CheckpointStore
from .idempotency import IdempotencyStore
from .result_store import ExecutionResultStore
from .retry import DEFAULT_EXECUTION_POLICY, DEFAULT_TOOL_POLICY, DlqReason, DlqRouter, RetryPolicy

__all__ = [
    "IdempotencyStore",
    "RetryPolicy",
    "DlqReason",
    "DlqRouter",
    "CheckpointStore",
    "ExecutionResultStore",
    "DEFAULT_EXECUTION_POLICY",
    "DEFAULT_TOOL_POLICY",
]
