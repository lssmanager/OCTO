import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodTypeAny } from 'zod';
import {
  AgentVersionSchema,
  ApprovalSchema,
  CanonicalChatMessageSchema,
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  ChatUsageSchema,
  CheckpointWriteSchema,
  ExecutionCheckpointSchema,
  ExecutionContextSchema,
  OutboxEventSchema,
  ToolDefinitionSchema,
  ToolExecutionRequestSchema,
  ToolExecutionResultSchema,
  ToolInvocationSchema,
} from '../../src/zod';

export const CONTRACT_SCHEMAS = {
  ExecutionCheckpointSchema,
  CheckpointWriteSchema,
  CanonicalChatMessageSchema,
  ChatCompletionRequestSchema,
  ChatCompletionResponseSchema,
  ChatUsageSchema,
  ToolDefinitionSchema,
  ToolExecutionRequestSchema,
  ToolExecutionResultSchema,
  ToolInvocationSchema,
  ApprovalSchema,
  OutboxEventSchema,
  AgentVersionSchema,
  ExecutionContextSchema,
} satisfies Record<string, ZodTypeAny>;

export type ContractName = keyof typeof CONTRACT_SCHEMAS;
export type VariantName = 'minimum' | 'maximum' | 'nullable';
export type ContractCase = Record<VariantName, Record<string, unknown>>;

const __dirname = dirname(fileURLToPath(import.meta.url));
const casesPath = resolve(__dirname, '../fixtures/conformance/f1-runtime-contract-cases.json');

export const CONTRACT_CASES = JSON.parse(readFileSync(casesPath, 'utf8')) as Record<
  ContractName,
  ContractCase
>;

export const CONTRACT_NAMES = Object.keys(CONTRACT_SCHEMAS) as ContractName[];
export const VARIANT_NAMES: VariantName[] = ['minimum', 'maximum', 'nullable'];

export function extraFieldPayload(contractName: ContractName): Record<string, unknown> {
  return {
    ...CONTRACT_CASES[contractName].minimum,
    unexpectedConformanceField: 'must be rejected by Zod and generated Pydantic',
  };
}
