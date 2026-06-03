import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  CONTRACT_CASES,
  CONTRACT_NAMES,
  VARIANT_NAMES,
} from '../packages/contracts/tests/utils/conformance-fixtures';
import * as contracts from '../packages/contracts/dist/index.mjs';

const ajv = new Ajv2020({ allErrors: true, strict: false } as any);
ajv.addFormat('date-time', true);
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

console.log('Zod -> JSON Schema validation passed for F1 runtime conformance fixtures');
