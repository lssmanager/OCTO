# packages/contracts/generated Plan

## Purpose

This directory exists to hold generated artifacts derived from `@octo/contracts` source schemas.

For F2, the goal is to make the Python mirror used by `apps/runtime-worker` come out of the TypeScript Zod source automatically instead of maintaining a parallel handwritten mirror.

## Source of truth

F2 schemas live in:

- `packages/contracts/src/f2/shared.ts`
- `packages/contracts/src/f2/execution.ts`
- `packages/contracts/src/f2/runtime-projections.ts`
- `packages/contracts/src/f2/replay.ts`
- `packages/contracts/src/f2/index.ts`

Those files are the canonical source for:

- replay requests and responses
- checkpoint summaries
- runtime projection DTOs
- WS/SSE delta envelopes
- runtime overview/detail payloads

## Generation pipeline

1. `pnpm contracts:build`
   - builds `packages/contracts/dist/*`
   - runs `scripts/generate-json-schema.mjs`
2. `scripts/generate-json-schema.mjs`
   - imports both the root contract entrypoint and `packages/contracts/dist/f2/index.mjs`
   - emits JSON Schema artifacts under `packages/contracts/generated/json-schema`
3. `pnpm contracts:python`
   - runs `scripts/generate_pydantic_models.py`
   - converts every JSON Schema file in `packages/contracts/generated/json-schema` into Pydantic v2 models under `apps/runtime-worker/app/contracts/generated`
4. `pnpm contracts:check`
   - fails if generated artifacts drift from committed files

## Operating rule

When a new cross-language F2 contract is added:

1. define it in `packages/contracts/src/f2/*`
2. export it from `packages/contracts/src/f2/index.ts`
3. add it to the required schema list in `scripts/generate-json-schema.mjs`
4. run `pnpm contracts:build`
5. run `pnpm contracts:python`
6. commit the generated JSON Schema and Python artifacts together

## Non-goals

- no manual hand-edited Python mirror for F2 replay/projection contracts
- no browser-specific view model generation in this pipeline
- no DB row schema generation from Drizzle in this step

## CI expectation

`pnpm contracts:validate` remains the enforcement gate for:

- TS schema correctness
- JSON Schema generation
- Pydantic generation
- drift detection between source and generated artifacts
