# @octo/contracts

Zod schemas in `packages/contracts/src/zod` are the source of truth.

## Sync pipeline (TS -> JSON Schema -> Pydantic)

- `pnpm contracts:build`: builds `@octo/contracts` and generates JSON Schema files in `packages/contracts/generated/json-schema`.
- `pnpm contracts:python`: generates Pydantic v2 models into `apps/runtime-worker/app/contracts/generated`.
- `pnpm contracts:check`: fails on drift using git diff for generated folders.
- `pnpm contracts:validate`: runs full pipeline + TS/JSON-schema roundtrip validation + drift check.

## Rules

- Do **not** manually edit generated files under:
  - `packages/contracts/generated/json-schema`
  - `apps/runtime-worker/app/contracts/generated`
- Update Zod schemas first, then regenerate artifacts.
- CI runs the same flow and fails PRs when generated artifacts are stale.

## Missing optional schemas

The generator auto-includes optional schemas when exported by `@octo/contracts`:
`ChatCompletionRequestSchema`, `ChatCompletionResponseSchema`, `ChatUsageSchema`, `ToolDefinitionSchema`, `ToolExecutionRequestSchema`, `ToolExecutionResultSchema`, `RetryPolicySchema`.
If absent, they are skipped until implemented.
