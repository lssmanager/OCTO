"""Execution Plane service layer.

Services contain ALL business logic for the runtime worker.
Routers only handle HTTP contract, auth, and dispatch — never logic.

Architectural boundary (F0-002):
  - services/ may import schemas, config, telemetry, contracts
  - services/ must NEVER import anything from apps/api (control plane)
  - services/ must NEVER write to the agents/executions topology tables
"""
