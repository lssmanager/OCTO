import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

function pythonEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONPATH: [resolve('apps/runtime-worker'), process.env.PYTHONPATH].filter(Boolean).join(':'),
  };
}

export function validateWithPython(contractName: string, payload: unknown): unknown {
  const result = spawnSync(
    'python3',
    [resolve('scripts/contract_conformance_bridge.py'), contractName],
    {
      cwd: resolve('.'),
      env: pythonEnv(),
      input: JSON.stringify(payload),
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Python contract bridge failed for ${contractName}:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return JSON.parse(result.stdout) as unknown;
}

export function validateBatchWithPython<T extends Record<string, Record<string, unknown>>>(
  payloads: T
): T {
  const result = spawnSync(
    'python3',
    [resolve('scripts/contract_conformance_bridge.py'), '--batch'],
    {
      cwd: resolve('.'),
      env: pythonEnv(),
      input: JSON.stringify(payloads),
      encoding: 'utf8',
    }
  );

  if (result.status !== 0) {
    throw new Error(
      `Python contract bridge batch failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return JSON.parse(result.stdout) as T;
}
