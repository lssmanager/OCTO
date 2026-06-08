from __future__ import annotations

import importlib
import json
import os
import subprocess
from pathlib import Path

import pytest
from pydantic import ValidationError

ROOT = Path(__file__).resolve().parents[4]
BRIDGE = ROOT / "scripts/contract_conformance_bridge.py"


def test_contract_bridge_uses_generated_pydantic_models_not_legacy_contracts() -> None:
    bridge_source = BRIDGE.read_text(encoding="utf-8")

    assert "app.contracts.generated" in bridge_source
    assert "src.contracts" not in bridge_source
    assert "apps.runtime-worker.src.contracts" not in bridge_source


def test_generated_execution_schema_rejects_legacy_only_execution_status() -> None:
    module = importlib.import_module("app.contracts.generated.ExecutionSchema")
    payload = {
        "id": "exec-legacy-status",
        "tenantId": "tenant-a",
        "agentId": "agent-a",
        "agentVersionId": "agent-version-a",
        "state": "awaiting_approval",
        "version": 1,
        "inputJson": {},
        "attemptCount": 0,
        "reclaimCount": 0,
        "createdBy": "tester",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
    }

    with pytest.raises(ValidationError):
        module.ExecutionSchema.model_validate(payload)


def test_contract_bridge_rejects_legacy_only_execution_status() -> None:
    payload = {
        "id": "exec-legacy-status",
        "tenantId": "tenant-a",
        "agentId": "agent-a",
        "agentVersionId": "agent-version-a",
        "state": "awaiting_approval",
        "version": 1,
        "inputJson": {},
        "attemptCount": 0,
        "reclaimCount": 0,
        "createdBy": "tester",
        "createdAt": "2026-01-01T00:00:00Z",
        "updatedAt": "2026-01-01T00:00:00Z",
    }
    result = subprocess.run(
        ["python3", str(BRIDGE), "ExecutionSchema"],
        cwd=ROOT,
        env={**os.environ, "PYTHONPATH": str(ROOT / "apps/runtime-worker")},
        input=json.dumps(payload),
        text=True,
        capture_output=True,
        check=False,
    )

    assert result.returncode != 0
    assert "awaiting_approval" in result.stderr
