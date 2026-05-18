#!/usr/bin/env python3
"""
packages/contracts/tests/validate-contract-parity.py

Contract parity validator — Fix 5/CI step.

What this script does:
  1. Imports the generated Pydantic models from generated/contracts.py
  2. Loads each fixture JSON from tests/fixtures/
  3. Validates each fixture against its corresponding Pydantic model
  4. Asserts field-set symmetry: every field in the fixture must exist
     in the model AND every required model field must exist in the fixture
  5. Exits 0 on full pass, 1 on any failure (fails CI)

Design decisions:
  - No test framework dependency (pytest, unittest) — runs with stdlib only
    plus pydantic. This keeps the CI step minimal: pip install pydantic.
  - Field symmetry check is separate from Pydantic validation. Pydantic with
    model_config.extra='ignore' would silently accept extra fields; we want
    to catch them as contract drift.
  - Each failure is printed with field-level detail before exit(1) so the
    CI log is immediately actionable.

Usage:
  pip install pydantic
  python packages/contracts/tests/validate-contract-parity.py

CI runs this from the repo root after: pnpm --filter @octo/contracts codegen
"""

from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import Any

# ─── Path setup ─────────────────────────────────────────────────────────────────

REPO_ROOT     = Path(__file__).resolve().parents[3]   # up from tests/ → contracts/ → packages/ → repo root
CONTRACTS_DIR = REPO_ROOT / 'packages' / 'contracts'
GENERATED_DIR = CONTRACTS_DIR / 'generated'
FIXTURES_DIR  = CONTRACTS_DIR / 'tests' / 'fixtures'

# Add generated/ to sys.path so we can import contracts.py
sys.path.insert(0, str(GENERATED_DIR))

# ─── Fixture → model mapping ────────────────────────────────────────────────────────

# Maps fixture filename (without .json) to the Pydantic model class name in contracts.py.
# This is the single place to register new fixtures when schemas are added.
FIXTURE_MODEL_MAP: dict[str, str] = {
    'execution_job':  'ExecutionJobData',
    'delegation_job': 'DelegationJobData',
    'tool_job':       'ToolJobData',
    'memory_job':     'MemoryJobData',
    'health_job':     'HealthJobData',
}

# ─── Helpers ─────────────────────────────────────────────────────────────────────

def green(s: str) -> str:
    return f'\033[32m{s}\033[0m'

def red(s: str) -> str:
    return f'\033[31m{s}\033[0m'

def yellow(s: str) -> str:
    return f'\033[33m{s}\033[0m'

def bold(s: str) -> str:
    return f'\033[1m{s}\033[0m'

def get_model_fields(model_class: Any) -> set[str]:
    """Return the set of field names defined on a Pydantic v2 model."""
    return set(model_class.model_fields.keys())

def get_required_fields(model_class: Any) -> set[str]:
    """Return fields that have no default (required in Pydantic v2)."""
    return {
        name
        for name, field in model_class.model_fields.items()
        if field.is_required()
    }

def flatten_keys(obj: Any, prefix: str = '') -> set[str]:
    """Recursively collect all dotted key paths from a nested dict."""
    keys: set[str] = set()
    if not isinstance(obj, dict):
        return keys
    for k, v in obj.items():
        full = f'{prefix}.{k}' if prefix else k
        keys.add(full)
        keys.update(flatten_keys(v, full))
    return keys

# ─── Validation logic ────────────────────────────────────────────────────────────────

def validate_fixture(
    fixture_name: str,
    fixture_data: dict[str, Any],
    model_class: Any,
) -> list[str]:
    """
    Validates fixture_data against model_class.
    Returns a list of error strings (empty = pass).
    """
    errors: list[str] = []

    # ─── 1. Pydantic validation ────────────────────────────────────────────
    try:
        model_class.model_validate(fixture_data)
    except Exception as exc:  # noqa: BLE001
        # pydantic.ValidationError inherits from ValueError
        for line in str(exc).splitlines():
            errors.append(f'  Pydantic: {line}')

    # ─── 2. Top-level field symmetry check ──────────────────────────────────
    model_fields   = get_model_fields(model_class)
    required_fields = get_required_fields(model_class)
    fixture_fields = set(fixture_data.keys())

    # Required fields missing from fixture — contract drift
    missing = required_fields - fixture_fields
    if missing:
        errors.append(
            f'  Symmetry: fixture is missing required fields: {sorted(missing)}'
        )

    # Fields in fixture that are unknown to the model — stale fixture
    unknown = fixture_fields - model_fields
    if unknown:
        errors.append(
            f'  Symmetry: fixture has fields unknown to model: {sorted(unknown)}'
        )

    return errors

# ─── Main ─────────────────────────────────────────────────────────────────────

def main() -> int:
    print(bold('\n▶ OCTO Contract Parity Validator'))
    print(f'  contracts.py : {GENERATED_DIR / "contracts.py"}')
    print(f'  fixtures     : {FIXTURES_DIR}\n')

    # ─── Import contracts module ──────────────────────────────────────────────
    contracts_py = GENERATED_DIR / 'contracts.py'
    if not contracts_py.exists():
        print(red('ERROR: contracts.py not found.'))
        print(yellow('  Run: pnpm --filter @octo/contracts codegen'))
        return 1

    try:
        import importlib.util
        spec = importlib.util.spec_from_file_location('contracts', contracts_py)
        contracts = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
        spec.loader.exec_module(contracts)  # type: ignore[union-attr]
    except Exception:  # noqa: BLE001
        print(red('ERROR: Failed to import contracts.py:'))
        traceback.print_exc()
        return 1

    # ─── Run validations ────────────────────────────────────────────────────────────────
    total   = 0
    passed  = 0
    failed  = 0
    all_errors: dict[str, list[str]] = {}

    for fixture_name, model_name in FIXTURE_MODEL_MAP.items():
        total += 1
        fixture_file = FIXTURES_DIR / f'{fixture_name}.json'

        # ─ Check fixture file exists
        if not fixture_file.exists():
            all_errors[fixture_name] = [f'  Fixture file not found: {fixture_file}']
            failed += 1
            continue

        # ─ Load fixture JSON
        try:
            fixture_data = json.loads(fixture_file.read_text())
        except json.JSONDecodeError as exc:
            all_errors[fixture_name] = [f'  Invalid JSON: {exc}']
            failed += 1
            continue

        # ─ Resolve model class from contracts module
        model_class = getattr(contracts, model_name, None)
        if model_class is None:
            all_errors[fixture_name] = [
                f'  Model class \'{model_name}\' not found in contracts.py',
                f'  Run: pnpm --filter @octo/contracts codegen',
            ]
            failed += 1
            continue

        # ─ Validate
        errors = validate_fixture(fixture_name, fixture_data, model_class)

        if errors:
            all_errors[fixture_name] = errors
            failed += 1
            print(f'  {red("FAIL")}  {fixture_name}  →  {model_name}')
            for err in errors:
                print(yellow(err))
        else:
            passed += 1
            print(f'  {green("PASS")}  {fixture_name}  →  {model_name}')

    # ─── Summary ───────────────────────────────────────────────────────────────────────
    print()
    if failed == 0:
        print(green(bold(f'✔ All {total} contract fixtures passed.')))
        return 0
    else:
        print(red(bold(f'✘ {failed}/{total} fixtures failed.')))
        print()
        print(yellow('To fix contract drift:'))
        print(yellow('  1. Update the Zod schema in packages/contracts/src/schemas/index.ts'))
        print(yellow('  2. Run: pnpm --filter @octo/contracts codegen'))
        print(yellow('  3. Update fixtures in packages/contracts/tests/fixtures/'))
        print(yellow('  4. Commit: contracts.py + fixtures together'))
        return 1

if __name__ == '__main__':
    sys.exit(main())
