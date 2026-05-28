import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { zodToJsonSchema } from 'zod-to-json-schema';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const contracts = await import(path.join(root, 'packages/contracts/dist/index.mjs'));
const outDir = path.join(root, 'packages/contracts/generated/json-schema');
const generatedDir = path.join(root, 'packages/contracts/generated');

const required = [
  'ExecutionSchema','ExecutionStepSchema','ExecutionCheckpointSchema','CheckpointWriteSchema',
  'AgentVersionSchema','ToolInvocationSchema','ApprovalSchema','OutboxEventSchema','BudgetPolicySchema',
];
const optional = [
  'ChatCompletionRequestSchema','ChatCompletionResponseSchema','ChatUsageSchema','ToolDefinitionSchema','ToolExecutionRequestSchema','ToolExecutionResultSchema','RetryPolicySchema',
];

await fs.mkdir(outDir, { recursive: true });
await fs.mkdir(generatedDir, { recursive: true });

for (const name of required) {
  if (!contracts[name]) throw new Error(`Missing required schema export: ${name}`);
}

for (const name of [...required, ...optional]) {
  const schema = contracts[name];
  if (!schema) continue;
  const json = zodToJsonSchema(schema, { name, target: 'jsonSchema7' });
  await fs.writeFile(path.join(outDir, `${name}.json`), JSON.stringify(json, null, 2) + '\n', 'utf8');
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
