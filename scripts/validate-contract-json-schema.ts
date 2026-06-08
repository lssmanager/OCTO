import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import {
  CONTRACT_CASES,
  CONTRACT_NAMES,
  VARIANT_NAMES,
} from '../packages/contracts/tests/utils/conformance-fixtures';
import * as contracts from '../packages/contracts/dist/index.mjs';

const ajv = new Ajv2020({ allErrors: true, strict: false } as any);
addFormats(ajv, { mode: 'full', formats: ['date-time'] });
const load = (name: string) =>
  JSON.parse(readFileSync(`packages/contracts/generated/json-schema/${name}.json`, 'utf-8'));

for (const contractName of CONTRACT_NAMES) {
  const zodSchema = (contracts as Record<string, { parse: (payload: unknown) => unknown }>)[
    contractName
  ];
  if (!zodSchema) {
    throw new Error(`Missing contract export: ${contractName}`);
  }

  const validate = ajv.compile(load(contractName) as any);
  for (const variantName of VARIANT_NAMES) {
    const payload = CONTRACT_CASES[contractName][variantName];
    zodSchema.parse(payload);
    if (!validate(payload)) {
      throw new Error(
        `${contractName}/${variantName} JSON Schema failed: ${ajv.errorsText(validate.errors)}`
      );
    }
  }
}


function assertInvalidDateTimeFixtureFails(): void {
  const schemaName = 'ToolInvocationSchema';
  const validate = ajv.compile(load(schemaName) as any);
  const payload = {
    ...CONTRACT_CASES.ToolInvocationSchema.maximum,
    startedAt: '2026-99-99T99:99:99Z',
  };

  if (validate(payload)) {
    throw new Error(
      `${schemaName}/invalid-date-time unexpectedly passed JSON Schema validation; Ajv date-time format enforcement is disabled`
    );
  }
}

assertInvalidDateTimeFixtureFails();

console.log('Zod -> JSON Schema validation passed for F1 runtime conformance fixtures');
