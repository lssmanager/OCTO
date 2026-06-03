from __future__ import annotations

import json
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[4]
CASES_PATH = ROOT / "packages/contracts/tests/fixtures/conformance/f1-runtime-contract-cases.json"
CONTRACT_CASES: dict[str, dict[str, dict[str, Any]]] = json.loads(CASES_PATH.read_text())
CONTRACT_NAMES = tuple(CONTRACT_CASES.keys())
VARIANT_NAMES = ("minimum", "maximum", "nullable")


def _run_zod_bridge(args: list[str], payload: Any) -> Any:
    result = subprocess.run(
        ["pnpm", "exec", "tsx", "scripts/contract_zod_bridge.ts", *args],
        cwd=ROOT,
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
    )
    if result.returncode != 0:
        raise AssertionError(f"Zod bridge failed\nstdout:\n{result.stdout}\nstderr:\n{result.stderr}")
    return json.loads(result.stdout)


@lru_cache(maxsize=1)
def zod_serialized_cases() -> dict[str, dict[str, dict[str, Any]]]:
    return _run_zod_bridge(["--batch"], CONTRACT_CASES)


def validate_batch_with_zod(payloads: dict[str, dict[str, dict[str, Any]]]) -> dict[str, dict[str, dict[str, Any]]]:
    return _run_zod_bridge(["--batch"], payloads)


def validate_with_zod(contract_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    return _run_zod_bridge([contract_name], payload)
