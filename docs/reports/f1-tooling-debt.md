# F1 Tooling Debt: lint:boundaries and formatcheck

This is the tracking artifact for issue #265 lint/format decision and GitHub issue #275 (`[F1-TOOLING] Resolver deuda de lint:boundaries y formatcheck fuera del close gate`).

## Status

Resolved for issue #275. `pnpm lint:boundaries` and `pnpm formatcheck` are restored as useful standalone engineering hygiene checks, while remaining outside `pnpm f1:close-gate` for the F1 closure decision.

## Decision

`pnpm lint:boundaries` and `pnpm formatcheck` are **not** part of `pnpm f1:close-gate` for F1 closure. They should be considered candidates for promotion after the team has at least one stable green baseline outside the close gate. The default promotion point is F2, unless F1 stable explicitly decides to add them earlier.

## Rationale

F1 closure is a strict live-system gate: build/typecheck, lint, unit tests, DB/Redis integration, tenant isolation, observability, migrations, compose build/up, public smoke, Agent Graph F1, metadata and runtime DB-role evidence.

`pnpm lint:boundaries` and `pnpm formatcheck` previously failed for repository/tooling reasons unrelated to live F1 runtime evidence. Blocking F1 on that debt would have obscured whether the live F1 system could be validated.

## Resolution

The issue #275 cleanup keeps the checks outside the close gate but restores them as actionable commands:

1. `eslint.config.js` now keeps the `eslint-plugin-boundaries` compatibility shim for ESLint 10 and makes the OCTO zones explicit: `leaf`, `infra`, `provider-sdk`, `agent-core`, `ui`, `frontend`, `control-plane`, `runtime`, `reclaimer`, and `worker`.
2. The boundaries topology now separates `packages/sdk-abstractions` from `packages/agent-core`, so frontend code can depend on provider abstractions and UI/contracts without importing runtime agent-core logic.
3. `infra/grafana/alerting/contact-points.yaml` now uses parseable YAML for templated environment placeholders instead of inline flow maps with unquoted `${...}` values.
4. `.prettierignore` documents the repo-wide format policy for build outputs, generated artifacts, lockfiles, logs and manually wrapped Markdown docs.
5. `docs/ci.md` documents the standalone tooling hygiene checks and the decision not to promote them into the F1 close gate until F1 stable or F2.

## Historical evidence

Commands observed before the cleanup:

```bash
pnpm lint:boundaries
pnpm formatcheck
```

Observed result on 2026-06-04 UTC: `pnpm lint:boundaries` failed with exit code 2 before reporting boundaries because `eslint-plugin-boundaries` called `context.getFilename` under ESLint 10. `pnpm formatcheck` failed with exit code 2. The first hard format error was:

```text
infra/grafana/alerting/contact-points.yaml: SyntaxError: Separator , missing in flow map (8:38)
settings: { integrationKey: ${PAGERDUTY_INTEGRATION_KEY} }
```

## Follow-up policy

Keep `pnpm lint:boundaries` and `pnpm formatcheck` as standalone checks until they have stable green runs in development and CI. Revisit promotion into a strict gate at F2 by default, or earlier only if F1 stable explicitly accepts the extra gate cost.
