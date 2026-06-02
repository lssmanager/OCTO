import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const contractsPackageJson = path.join(root, 'packages/contracts/package.json');
const requireFromContracts = createRequire(contractsPackageJson);
const { z } = requireFromContracts('zod');
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

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullSchema(value) {
  return isObject(value) && value.type === 'null';
}

function isSimpleTypeSchema(value) {
  if (!isObject(value) || typeof value.type !== 'string') return false;
  const keys = Object.keys(value).filter((key) => key !== 'optional');
  return keys.length === 1 && keys[0] === 'type';
}

function normalizeJsonSchema(value) {
  if (Array.isArray(value)) {
    return value.map((item) => normalizeJsonSchema(item));
  }

  if (!isObject(value)) {
    return value;
  }

  const normalized = {};
  for (const [key, child] of Object.entries(value)) {
    if (key === 'optional') continue;
    normalized[key] = normalizeJsonSchema(child);
  }

  if (isObject(normalized.$defs)) {
    normalized.definitions = normalizeJsonSchema(normalized.$defs);
    delete normalized.$defs;
  }

  if (Array.isArray(normalized.oneOf) && normalized.oneOf.length === 2) {
    const [left, right] = normalized.oneOf;
    const nullableBranch = isNullSchema(left) ? left : isNullSchema(right) ? right : null;
    const valueBranch = nullableBranch === left ? right : nullableBranch === right ? left : null;

    if (nullableBranch && valueBranch) {
      delete normalized.oneOf;

      if (isSimpleTypeSchema(valueBranch)) {
        normalized.type = [valueBranch.type, 'null'];
      } else {
        normalized.anyOf = [valueBranch, nullableBranch];
      }
    }
  }

  return normalized;
}

function wrapNamedDefinition(name, schema) {
  return {
    $ref: `#/definitions/${name}`,
    definitions: {
      [name]: normalizeJsonSchema(
        z.toJSONSchema(schema, {
          target: 'draft-07',
          unrepresentable: 'any',
        })
      ),
    },
    $schema: 'http://json-schema.org/draft-07/schema#',
  };
}

for (const name of [...required, ...optional]) {
  const schema = contracts[name];
  if (!schema) continue;
  const json = wrapNamedDefinition(name, schema);
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
