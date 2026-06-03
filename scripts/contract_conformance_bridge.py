#!/usr/bin/env python3
from __future__ import annotations

import importlib
import json
import sys
from typing import Any

MODEL_BY_CONTRACT = {
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


def _load_model(contract_name: str) -> type[Any]:
    try:
        module_name, class_name = MODEL_BY_CONTRACT[contract_name]
    except KeyError as exc:
        raise SystemExit(f"Unsupported contract: {contract_name}") from exc
    module = importlib.import_module(f"app.contracts.generated.{module_name}")
    return getattr(module, class_name)


def _validate(contract_name: str, payload: Any) -> Any:
    model = _load_model(contract_name).model_validate(payload)
    return json.loads(model.model_dump_json(by_alias=True, exclude_unset=True))


def main() -> int:
    if len(sys.argv) == 2 and sys.argv[1] == "--batch":
        batch = json.loads(sys.stdin.read())
        output = {
            contract_name: {
                variant_name: _validate(contract_name, payload)
                for variant_name, payload in variants.items()
            }
            for contract_name, variants in batch.items()
        }
        sys.stdout.write(json.dumps(output))
        sys.stdout.write("\n")
        return 0

    if len(sys.argv) != 2:
        raise SystemExit("usage: contract_conformance_bridge.py <ContractSchemaName>|--batch")
    payload = json.loads(sys.stdin.read())
    sys.stdout.write(json.dumps(_validate(sys.argv[1], payload)))
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
