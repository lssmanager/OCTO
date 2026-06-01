from pathlib import Path


def test_generated_contracts_present() -> None:
    root = Path(__file__).resolve().parents[4]
    ts_schema = root / "packages/contracts/generated/json-schema/ExecutionSchema.json"
    py_model = root / "apps/runtime-worker/app/contracts/generated/ExecutionSchema.py"
    assert ts_schema.exists(), "missing generated TS JSON schema"
    assert py_model.exists(), "missing generated Python contract model"
