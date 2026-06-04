# F1 Tooling Debt: lint:boundaries and formatcheck

This is the separate tracking artifact for the issue #265 lint/format decision.

## Decision

`pnpm lint:boundaries` and `pnpm formatcheck` are **not** part of `pnpm f1:close-gate` for F1 closure. They remain mandatory engineering hygiene to fix outside the F1 live-runtime close decision.

## Rationale

F1 closure is a strict live-system gate: build/typecheck, lint, unit tests, DB/Redis integration, tenant isolation, observability, migrations, compose build/up, public smoke, Agent Graph F1, metadata and runtime DB-role evidence.

`pnpm lint:boundaries` and `pnpm formatcheck` currently fail for pre-existing repository/tooling reasons unrelated to the live F1 runtime. Boundary lint fails inside the ESLint/plugin compatibility path before producing a useful architectural result, while formatcheck fails on Prettier parsing environment-template syntax in `infra/grafana/alerting/contact-points.yaml` and broad formatting drift across unrelated files. Blocking F1 on that debt would obscure whether the live F1 system can be validated.

## Last local evidence

Commands:

```bash
pnpm lint:boundaries
pnpm formatcheck
```

Observed result on 2026-06-04 UTC: `pnpm lint:boundaries` failed with exit code 2 before reporting boundaries because `eslint-plugin-boundaries` called `context.getFilename` under ESLint 10. `pnpm formatcheck` failed with exit code 2. The first hard format error was:

```text
infra/grafana/alerting/contact-points.yaml: SyntaxError: Separator , missing in flow map (8:38)
settings: { integrationKey: ${PAGERDUTY_INTEGRATION_KEY} }
```

## Required follow-up

Create a separate GitHub issue from this artifact if one does not already exist, then either:

1. fix the ESLint/plugin compatibility for `lint:boundaries`;
2. fix Prettier parsing/configuration for templated YAML and format the repository; or
3. narrow `formatcheck` to supported file types and add an explicit generated/template ignore policy.

After that debt is resolved, this decision can be revisited and the checks can be promoted into `pnpm f1:close-gate`.
