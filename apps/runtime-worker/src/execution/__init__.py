"""OCTO Runtime Worker — Durable Execution Engine (C5).

Public API for the execution module. Import from here, not from submodules.

Architectural rules (ABSOLUTE PRINCIPLES 12, 13):
  - Postgres is system of record (via Control Plane API calls)
  - Redis is used for: queue, cache, transient coordination, checkpoints
  - Executions must survive container restarts via CheckpointStore
  - This module NEVER writes to Postgres directly
"""
from .checkpoint import CheckpointStore
from .engine import ExecutionEngine
from .idempotency import IdempotencyStore
from .result_store import ExecutionResultStore
from .retry import DEFAULT_EXECUTION_POLICY, DEFAULT_TOOL_POLICY, DlqReason, DlqRouter, RetryPolicy

__all__ = [
    "ExecutionEngine",
    "IdempotencyStore",
    "RetryPolicy",
    "DlqReason",
    "DlqRouter",
    "CheckpointStore",
    "ExecutionResultStore",
    "DEFAULT_EXECUTION_POLICY",
    "DEFAULT_TOOL_POLICY",
]
