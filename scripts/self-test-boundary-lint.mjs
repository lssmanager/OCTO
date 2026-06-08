#!/usr/bin/env node
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const fixtureDir = 'apps/api/src/__boundary_lint_self_test__';
const fixturePath = `${fixtureDir}/forbidden-provider-import.ts`;
mkdirSync(fixtureDir, { recursive: true });
writeFileSync(
  fixturePath,
  "import OpenAI from 'openai';\n\nexport const forbiddenProviderImport = OpenAI;\n",
  'utf8'
);
try {
  const result = spawnSync(
    'pnpm',
    ['exec', 'eslint', '--config', 'eslint.config.js', fixturePath, '--max-warnings', '0'],
    { encoding: 'utf8' }
  );
  if (result.status === 0) {
    throw new Error(
      `Boundary lint self-test expected ${fixturePath} to fail, but ESLint passed.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  const output = `${result.stdout}\n${result.stderr}`;
  if (!output.includes('no-restricted-imports')) {
    throw new Error(
      `Boundary lint self-test failed for the wrong reason; expected no-restricted-imports.\nstdout:\n${result.stdout}\nstderr:\n${result.stderr}`
    );
  }
  console.log('boundary lint self-test blocked a forbidden provider SDK import outside packages/sdk-abstractions');
} finally {
  rmSync(fixtureDir, { recursive: true, force: true });
}
