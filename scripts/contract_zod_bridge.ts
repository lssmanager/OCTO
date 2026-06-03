import { readFileSync } from 'node:fs';
import * as schemas from '../packages/contracts/src/zod/index.ts';

const zodSchemas = ((schemas as { default?: unknown }).default ?? schemas) as Record<
  string,
  { parse: (payload: unknown) => unknown }
>;

function parse(contractName: string, payload: unknown): unknown {
  const schema = zodSchemas[contractName];
  if (!schema?.parse) {
    throw new Error(`Unsupported contract: ${contractName}`);
  }
  return schema.parse(payload);
}

if (process.argv[2] === '--batch') {
  const batch = JSON.parse(readFileSync(0, 'utf8')) as Record<string, Record<string, unknown>>;
  const output = Object.fromEntries(
    Object.entries(batch).map(([contractName, variants]) => [
      contractName,
      Object.fromEntries(
        Object.entries(variants).map(([variantName, payload]) => [
          variantName,
          parse(contractName, payload),
        ])
      ),
    ])
  );
  process.stdout.write(`${JSON.stringify(output)}\n`);
} else {
  const contractName = process.argv[2];
  if (!contractName) {
    throw new Error('usage: contract_zod_bridge.ts <ContractSchemaName>|--batch');
  }
  const payload = JSON.parse(readFileSync(0, 'utf8')) as unknown;
  process.stdout.write(`${JSON.stringify(parse(contractName, payload))}\n`);
}
