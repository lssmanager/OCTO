import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function workspaceRoot(): string {
  let current = __dirname;
  while (current !== dirname(current)) {
    if (existsSync(resolve(current, 'pnpm-workspace.yaml'))) return current;
    current = dirname(current);
  }
  throw new Error('Unable to locate workspace root for Python contract bridge');
}

const root = workspaceRoot();

function pythonEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    PYTHONPATH: [resolve(root, 'apps/runtime-worker'), process.env.PYTHONPATH]
      .filter(Boolean)
      .join(':'),
  };
}

export function validateWithPython(contractName: string, payload: unknown): unknown {
  const result = spawnSync(
    'python3',
    [resolve(root, 'scripts/contract_conformance_bridge.py'), contractName],
    {
      cwd: root,
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
  const result = spawnSync('python3', [resolve(root, 'scripts/contract_conformance_bridge.py'), '--batch'], {
    cwd: root,
    env: pythonEnv(),
    input: JSON.stringify(payloads),
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    throw new Error(
      `Python contract bridge batch failed:\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }

  return JSON.parse(result.stdout) as T;
}
