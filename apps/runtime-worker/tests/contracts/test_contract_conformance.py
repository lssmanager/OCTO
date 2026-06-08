from __future__ import annotations

import importlib
from typing import Any

import pytest
from pydantic import ValidationError

from tests.utils.contract_conformance_fixtures import (
    CONTRACT_CASES,
    CONTRACT_NAMES,
    VARIANT_NAMES,
    validate_batch_with_zod,
    validate_with_zod,
    zod_serialized_cases,
)

MODEL_BY_CONTRACT = {
    "ExecutionSchema": ("ExecutionSchema", "ExecutionSchema"),
    "ExecutionCheckpointSchema": ("ExecutionCheckpointSchema", "ExecutionCheckpointSchema"),
    "CheckpointWriteSchema": ("CheckpointWriteSchema", "CheckpointWriteSchema"),
    "CanonicalChatMessageSchema": ("CanonicalChatMessageSchema", "CanonicalChatMessageSchema"),
    "ChatCompletionRequestSchema": ("ChatCompletionRequestSchema", "ChatCompletionRequestSchema"),
    "ChatCompletionResponseSchema": ("ChatCompletionResponseSchema", "ChatCompletionResponseSchema"),
    "ChatUsageSchema": ("ChatUsageSchema", "ChatUsageSchema"),
    "ToolDefinitionSchema": ("ToolDefinitionSchema", "ToolDefinitionSchema"),
    "ToolExecutionRequestSchema": ("ToolExecutionRequestSchema", "ToolExecutionRequestSchema"),
    "ToolExecutionResultSchema": ("ToolExecutionResultSchema", "ToolExecutionResultSchema"),
    "ToolInvocationSchema": ("ToolInvocationSchema", "ToolInvocationSchema"),
    "ApprovalSchema": ("ApprovalSchema", "ApprovalSchema"),
    "OutboxEventSchema": ("OutboxEventSchema", "OutboxEventSchema"),
    "AgentVersionSchema": ("AgentVersionSchema", "AgentVersionSchema"),
    "ExecutionContextSchema": ("ExecutionContextSchema", "ExecutionContextSchema"),
}


def _model_for(contract_name: str) -> type[Any]:
    module_name, class_name = MODEL_BY_CONTRACT[contract_name]
    module = importlib.import_module(f"app.contracts.generated.{module_name}")
    return getattr(module, class_name)


def _python_json(contract_name: str, payload: dict[str, Any]) -> dict[str, Any]:
    model = _model_for(contract_name).model_validate(payload)
    return model.model_dump(mode="json", by_alias=True, exclude_unset=True)

PYTHON_SERIALIZED_CASES: dict[str, dict[str, dict[str, Any]]] | None = None
ZOD_FROM_PYTHON_CASES: dict[str, dict[str, dict[str, Any]]] | None = None
PYTHON_FROM_ZOD_CASES: dict[str, dict[str, dict[str, Any]]] | None = None
ZOD_FROM_PYTHON_FROM_ZOD_CASES: dict[str, dict[str, dict[str, Any]]] | None = None


def _python_serialized_cases() -> dict[str, dict[str, dict[str, Any]]]:
    global PYTHON_SERIALIZED_CASES
    if PYTHON_SERIALIZED_CASES is None:
        PYTHON_SERIALIZED_CASES = {
            contract_name: {
                variant_name: _python_json(contract_name, CONTRACT_CASES[contract_name][variant_name])
                for variant_name in VARIANT_NAMES
            }
            for contract_name in CONTRACT_NAMES
        }
    return PYTHON_SERIALIZED_CASES


def _zod_from_python_cases() -> dict[str, dict[str, dict[str, Any]]]:
    global ZOD_FROM_PYTHON_CASES
    if ZOD_FROM_PYTHON_CASES is None:
        ZOD_FROM_PYTHON_CASES = validate_batch_with_zod(_python_serialized_cases())
    return ZOD_FROM_PYTHON_CASES


def _python_from_zod_cases() -> dict[str, dict[str, dict[str, Any]]]:
    global PYTHON_FROM_ZOD_CASES
    if PYTHON_FROM_ZOD_CASES is None:
        PYTHON_FROM_ZOD_CASES = {
            contract_name: {
                variant_name: _python_json(contract_name, zod_serialized_cases()[contract_name][variant_name])
                for variant_name in VARIANT_NAMES
            }
            for contract_name in CONTRACT_NAMES
        }
    return PYTHON_FROM_ZOD_CASES


def _zod_from_python_from_zod_cases() -> dict[str, dict[str, dict[str, Any]]]:
    global ZOD_FROM_PYTHON_FROM_ZOD_CASES
    if ZOD_FROM_PYTHON_FROM_ZOD_CASES is None:
        ZOD_FROM_PYTHON_FROM_ZOD_CASES = validate_batch_with_zod(_python_from_zod_cases())
    return ZOD_FROM_PYTHON_FROM_ZOD_CASES


@pytest.mark.parametrize("contract_name", CONTRACT_NAMES)
@pytest.mark.parametrize("variant_name", VARIANT_NAMES)
def test_python_to_ts_to_python_roundtrip(contract_name: str, variant_name: str) -> None:
    serialized_by_ts = _zod_from_python_cases()[contract_name][variant_name]

    _model_for(contract_name).model_validate(serialized_by_ts)


@pytest.mark.parametrize("contract_name", CONTRACT_NAMES)
@pytest.mark.parametrize("variant_name", VARIANT_NAMES)
def test_ts_to_python_to_ts_roundtrip(contract_name: str, variant_name: str) -> None:
    serialized_by_python = _python_from_zod_cases()[contract_name][variant_name]

    assert _zod_from_python_from_zod_cases()[contract_name][variant_name]


@pytest.mark.parametrize("contract_name", CONTRACT_NAMES)
def test_extra_fields_are_rejected_by_generated_pydantic_and_zod(contract_name: str) -> None:
    payload = {
        **CONTRACT_CASES[contract_name]["minimum"],
        "unexpectedConformanceField": "must be rejected",
    }

    with pytest.raises(ValidationError):
        _model_for(contract_name).model_validate(payload)
    with pytest.raises(AssertionError):
        validate_with_zod(contract_name, payload)
