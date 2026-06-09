import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const legacyContracts = await import(path.join(root, 'packages/contracts/dist/index.mjs'));
const f2Contracts = await import(path.join(root, 'packages/contracts/dist/f2/index.mjs'));
const contracts = {
  ...legacyContracts,
  ...f2Contracts,
};
const { z } = await import(path.join(root, 'packages/contracts/node_modules/zod/index.js'));
const outDir = path.join(root, 'packages/contracts/generated/json-schema');
const generatedDir = path.join(root, 'packages/contracts/generated');

const required = [
  'ExecutionSchema',
  'ExecutionStepSchema',
  'ExecutionCheckpointSchema',
  'CheckpointWriteSchema',
  'AgentVersionSchema',
  'ToolInvocationSchema',
  'ApprovalSchema',
  'OutboxEventSchema',
  'BudgetPolicySchema',
  'CanonicalChatMessageSchema',
  'ChatCompletionRequestSchema',
  'ChatCompletionResponseSchema',
  'ChatUsageSchema',
  'ToolDefinitionSchema',
  'ToolExecutionRequestSchema',
  'ToolExecutionResultSchema',
  'ExecutionContextSchema',
  'ExecutionRuntimeProjectionSchema',
  'ExecutionTimelineEntrySchema',
  'ToolInvocationProjectionSchema',
  'WorkerRuntimeProjectionSchema',
  'QueueRuntimeProjectionSchema',
  'ExecutionCostProjectionSchema',
  'OutboxRuntimeProjectionSchema',
  'RuntimeOverviewSchema',
  'ExecutionRuntimeDetailSchema',
  'ReplayExecutionRequestSchema',
  'ReplayExecutionAcceptedSchema',
  'ExecutionCheckpointSummarySchema',
  'LinkedReplayExecutionSchema',
  'ExecutionCheckpointsResponseSchema',
  'ExecutionReplaysResponseSchema',
];
const optional = [
  'RetryPolicySchema',
  'PaginatedExecutionRuntimeProjectionSchema',
  'ExecutionTimelineResponseSchema',
  'ExecutionToolInvocationsResponseSchema',
  'QueueRuntimeProjectionListSchema',
  'WorkerRuntimeProjectionListSchema',
  'OutboxRuntimeProjectionListSchema',
  'RuntimeProjectionDeltaEnvelopeSchema',
  'RuntimeProjectionDeltaPayloadSchema',
];

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(generatedDir, { recursive: true });

function removeDefaultedPropertiesFromRequired(value) {
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value.required) && value.properties && typeof value.properties === 'object') {
    value.required = value.required.filter((propertyName) => {
      const propertySchema = value.properties[propertyName];
      return !(propertySchema && typeof propertySchema === 'object' && 'default' in propertySchema);
    });
    if (value.required.length === 0) delete value.required;
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(removeDefaultedPropertiesFromRequired);
    else removeDefaultedPropertiesFromRequired(child);
  }
}

function stripDateTimePatterns(value) {
  if (!value || typeof value !== 'object') return;
  if (value.format === 'date-time') delete value.pattern;
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) child.forEach(stripDateTimePatterns);
    else stripDateTimePatterns(child);
  }
}

for (const name of required) {
  if (!contracts[name]) throw new Error(`Missing required schema export: ${name}`);
}

for (const name of [...required, ...optional]) {
  const schema = contracts[name];
  if (!schema) continue;
  const json = z.toJSONSchema(schema);
  json.title = name;
  stripDateTimePatterns(json);
  removeDefaultedPropertiesFromRequired(json);
  await fs.writeFile(
    path.join(outDir, `${name}.json`),
    JSON.stringify(json, null, 2) + '\n',
    'utf8'
  );
}

const executionFsm = {
  statuses: contracts.ExecutionStatusValues,
  terminalStatuses: [...contracts.TERMINAL_STATUSES],
  transitions: Object.fromEntries(
    Object.entries(contracts.VALID_TRANSITIONS).map(([from, targets]) => [from, [...targets]])
  ),
};
await fs.writeFile(
  path.join(generatedDir, 'execution-fsm.json'),
  JSON.stringify(executionFsm, null, 2) + '\n',
  'utf8'
);

console.log(`Generated JSON Schemas in ${outDir}`);
console.log(`Generated execution FSM contract in ${path.join(generatedDir, 'execution-fsm.json')}`);
