# F1 Architecture Status

F1 is aligned to OCTO v5 as **Foundation + Agent Graph System**.

## Closed scope

- Foundation services must build, deploy and report honest health.
- Agent Graph belongs to F1: `Agency → Department → Workspace → Agent`, minimum CRUD, persisted hierarchy, effective policies/capabilities and operational state projection.
- The Agent Graph Console is a Control Plane console. It does not execute agents and does not stream runtime output.

## Security status

- Browser code must not use `NEXT_PUBLIC_OCTO_CONSOLE_TOKEN` or any other `NEXT_PUBLIC_*` secret for graph writes.
- `apps/web/src/app/api/agent-graph/route.ts` is the same-origin backend route for console graph reads/writes.
- Reads use server-side `OCTO_WEB_CONSOLE_TOKEN` and an `API_URL` base that includes `/api` (for example `http://localhost:3001/api` or `https://agents.socialstudies.cloud/api`).
- Writes require an `httpOnly` `octo_console_token` session cookie; unauthenticated callers cannot use the server-side read token for writes.
- Backend `apps/api/src/agents` JWT, RBAC, tenant and hierarchy guards remain authoritative.

## F1/F2 boundary

F1 stops at persisted graph hierarchy and state projection. Runtime execution, streaming responses, runtime event feeds and multi-agent runtime coordination remain outside F1.

## Validation status

- `scripts/f1-verify.sh` labels Agent Graph checks as F1.
- `scripts/f1-agent-graph-smoke.sh` validates persisted `Agency → Department → Workspace → Agent` creation plus missing-credential, invalid-hierarchy and cross-tenant/nonexistent-node errors against `/api/v1/agents/*`.
- `scripts/f2-agent-graph-smoke.sh` remains only as a compatibility wrapper around the F1 smoke.
