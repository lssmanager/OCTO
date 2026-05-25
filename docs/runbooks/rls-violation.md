# RLS Violation / Cross-Tenant Attempt

## Trigger
`OctoRLSViolationDetected` or `OctoAuthCrossTenantAttempt`.

## Steps
1. Treat as security incident and page security on-call.
2. Identify `table`, endpoint/repository path, actor/service, and tenant context.
3. Check auth logs for `WRONG_TENANT` and repeated principal fingerprints.
4. Validate DB session uses `SET LOCAL app.current_tenant` before access.
5. Confirm DB role has no `BYPASSRLS` and policies remain enabled.
6. Rotate service credentials/tokens if worker or service account is implicated.
7. Preserve audit logs and incident timeline artifacts.
