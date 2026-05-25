# Contract Drift Detected

## Trigger
`OctoContractDriftDetected`.

## Steps
1. Run contract generation/validation pipeline.
2. Diff TS and Python generated artifacts.
3. Identify source schema change and missing regeneration.
4. Regenerate artifacts and align versions.
5. Re-run drift checks before merge/release.
