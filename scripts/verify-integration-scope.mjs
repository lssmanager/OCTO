#!/usr/bin/env node
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const expectedApiTests = [
  'apps/api/src/agents/agent-graph.integration.test.ts',
  'apps/api/src/execution/f1-dispatch-reconciliation.integration.test.ts',
  'apps/api/src/execution/f1-dispatch-runtime.integration.test.ts',
  'apps/api/src/execution/f1-reclaim-runtime.integration.test.ts',
  'apps/api/src/ops/f1-observability.integration.test.ts',
  'apps/api/src/security/tenant-isolation.integration.test.ts',
];
const expectedDatabaseTests = ['packages/database/src/f1-database.integration.test.ts'];

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function walk(dir) {
  const entries = readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : [path];
  });
}

const discoveredApiTests = walk('apps/api/src')
  .filter((path) => path.endsWith('.integration.test.ts'))
  .sort();

assert(discoveredApiTests.length > 0, 'No API integration tests were discovered under apps/api/src');
assert(
  JSON.stringify(discoveredApiTests) === JSON.stringify(expectedApiTests),
  `API integration test scope drifted.\nExpected: ${expectedApiTests.join(', ')}\nActual:   ${discoveredApiTests.join(', ')}`
);
for (const path of [...expectedApiTests, ...expectedDatabaseTests]) {
  assert(existsSync(path), `Expected integration test is missing: ${path}`);
}

const rootPackage = JSON.parse(readFileSync('package.json', 'utf8'));
const apiPackage = JSON.parse(readFileSync('apps/api/package.json', 'utf8'));
assert(
  expectedApiTests.every((path) => rootPackage.scripts.testintegration.includes(`"${path}"`)),
  'Root testintegration script must explicitly include every API integration test from the repo root'
);
assert(
  rootPackage.scripts.testintegration.includes('"packages/database/src/f1-database.integration.test.ts"'),
  'Root testintegration script must include the database F1 integration test explicitly'
);
assert(
  apiPackage.scripts.testintegration.includes('--dir ../..') &&
    expectedApiTests.every((path) => apiPackage.scripts.testintegration.includes(`"${path}"`)),
  'apps/api testintegration script must execute from the repo root and explicitly include its own integration tests'
);

console.log(`integration scope includes ${discoveredApiTests.length} API integration tests and ${expectedDatabaseTests.length} database integration test`);
