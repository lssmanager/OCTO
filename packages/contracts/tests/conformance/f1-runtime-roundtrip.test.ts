import { describe, expect, it } from 'vitest';
import {
  CONTRACT_CASES,
  CONTRACT_NAMES,
  CONTRACT_SCHEMAS,
  VARIANT_NAMES,
  extraFieldPayload,
} from '../utils/conformance-fixtures';
import { validateBatchWithPython, validateWithPython } from '../utils/python-contract-bridge';

const PYTHON_SERIALIZED_CASES = validateBatchWithPython(CONTRACT_CASES);

const TS_SERIALIZED_FROM_PYTHON = Object.fromEntries(
  CONTRACT_NAMES.map((contractName) => [
    contractName,
    Object.fromEntries(
      VARIANT_NAMES.map((variantName) => [
        variantName,
        CONTRACT_SCHEMAS[contractName].parse(PYTHON_SERIALIZED_CASES[contractName][variantName]),
      ])
    ),
  ])
);
const PYTHON_RESERIALIZED_CASES = validateBatchWithPython(TS_SERIALIZED_FROM_PYTHON);

describe('F1 runtime contracts TS ⇔ Python conformance', () => {
  for (const contractName of CONTRACT_NAMES) {
    const zodSchema = CONTRACT_SCHEMAS[contractName];

    describe(contractName, () => {
      for (const variantName of VARIANT_NAMES) {
        it(`roundtrips ${variantName} payload TS -> Python -> TS`, () => {
          const parsedByTs = zodSchema.parse(CONTRACT_CASES[contractName][variantName]);
          expect(parsedByTs).toBeDefined();
          const serializedByPython = PYTHON_SERIALIZED_CASES[contractName][variantName];

          expect(() => zodSchema.parse(serializedByPython)).not.toThrow();
        });

        it(`roundtrips ${variantName} payload Python -> TS -> Python`, () => {
          const serializedByPython = PYTHON_SERIALIZED_CASES[contractName][variantName];
          const serializedByTs = zodSchema.parse(serializedByPython);

          expect(PYTHON_RESERIALIZED_CASES[contractName][variantName]).toBeDefined();
        });
      }

      it('rejects unexpected root-level fields in both Zod and generated Pydantic', () => {
        const payloadWithExtraField = extraFieldPayload(contractName);

        expect(() => zodSchema.parse(payloadWithExtraField)).toThrow();
        expect(() => validateWithPython(contractName, payloadWithExtraField)).toThrow();
      });
    });
  }
});
