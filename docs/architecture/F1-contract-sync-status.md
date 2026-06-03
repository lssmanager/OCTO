# F1 Contract Sync Status (TS/Python)

## Contract inventory (current)

| File | Language | Model/Contract | Current use | Status |
|---|---|---|---|---|
| `packages/contracts/src/zod/*` | TS | Canonical Zod schemas (`ExecutionSchema`, `ExecutionStepSchema`, `ExecutionCheckpointSchema`, `ToolInvocationSchema`, `ApprovalSchema`, etc.) | Source for generated artifacts | **canonical** |
| `packages/contracts/generated/json-schema/*.json` | JSON Schema | Generated schema artifacts | Input for Python model generation | generated |
| `apps/runtime-worker/app/contracts/generated/*.py` | Python | Pydantic models generated from JSON Schema | Runtime contract artifacts and contract tests | generated |
| `apps/runtime-worker/src/schemas/execution.py` | Python | Manual request/response models for FastAPI internal runtime endpoints (`/api/v1/execute`) | Active runtime HTTP adapter models | adapter (not SoT) |
| `apps/runtime-worker/src/contracts.py` | Python | Legacy manual F0/F2-style contract mirror | Not imported by canonical execute router/service path | legacy |
| `scripts/generate-json-schema.mjs` | Script | TS -> JSON Schema generation | Build/sync step | active |
| `scripts/generate_pydantic_models.py` | Script | JSON Schema -> Python Pydantic generation | Build/sync step | active |
| `scripts/validate-contract-json-schema.ts` | Script | Zod fixture parity against generated JSON Schema | Schema validation | active |
| `.github/workflows/contracts.yml` | CI | Generate + drift check + TS/Python conformance tests | CI enforcement | active |

## Import map (ExecutionRequest / ExecutionResult)

- Runtime HTTP path uses `apps/runtime-worker/src/schemas/execution.py` via `apps/runtime-worker/src/schemas/__init__.py`.
- Generated Python contracts are produced under `apps/runtime-worker/app/contracts/generated` and exercised in `apps/runtime-worker/tests/contracts/*`.
- TypeScript canonical contracts are exported from `@octo/contracts` and converted to JSON Schema.

## Decision

For F1 cross-language contracts, the **single source of truth** is:

- `packages/contracts/src/zod/*` (TypeScript canonical schemas).

Derived artifacts:

1. `packages/contracts/generated/json-schema/*.json`
2. `apps/runtime-worker/app/contracts/generated/*.py`

## Enforcement

CI and local check must regenerate before diff validation to avoid false-green drift checks.

- `pnpm contracts:build`
- `pnpm contracts:python`
- `pnpm contracts:check`
- `pnpm contracts:conformance`
- `pnpm contracts:validate`

## Legacy policy

- `apps/runtime-worker/src/contracts.py` remains as legacy/manual reference and is **not** the F1 canonical contract source.
- Legacy/manual models must not be used for cross-language source-of-truth checks.
