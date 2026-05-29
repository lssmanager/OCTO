# ADR-0018: F2 hierarchy nodes as explicit operational topology

## Status
Accepted

## Context
OCTO F2 needs an explicit Agency → Department → Workspace → Agent → SubAgent hierarchy for cognitive authority, delegation, and inheritance of models, tools, budgets, governance, Core Files, and memory policy. This hierarchy is not tenancy and must not be hidden in opaque metadata.

## Decision
Persist the hierarchy in a typed `hierarchy_nodes` table with `level`, `parent_id`, `activation_state`, and first-slice policy columns. Agents link to their operational node through `agents.hierarchy_node_id`. Existing agent creation remains compatible by creating a legacy explicit Agency/Department/Workspace chain when callers do not yet provide a hierarchy parent.

The Control Plane compiles effective snapshots from this table and stores them on `executions.context_snapshot_json`. Runtime workers consume that snapshot only; they do not resolve hierarchy from the database.

## Consequences
- Parent/child validity can be enforced in Control Plane code and audited from explicit rows.
- Future UI/API surfaces can manage hierarchy nodes directly without migrating opaque metadata.
- Tenancy remains unchanged; `tenant_id` is only an isolation key for storage/RLS, not a hierarchy level.
