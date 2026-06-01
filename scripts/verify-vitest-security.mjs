#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIN_SAFE_VITEST = '4.1.8';
const MIN_SAFE_VITE = '6.4.2';
const workspacePackages = [
  'package.json',
  'apps/api/package.json',
  'packages/database/package.json',
  'packages/events/package.json',
  'packages/queue/package.json',
  'packages/runtime-state/package.json',
];

const monitored = new Set([
  'vitest',
  '@vitest/ui',
  '@vitest/browser',
  '@vitest/coverage-v8',
  '@vitest/coverage-istanbul',
  'vite',
  'vite-node',
]);

function parseVersion(version) {
  const match = String(version).match(/^(?:[~^>=< ]*)?(\d+)\.(\d+)\.(\d+)/);
  if (!match) return null;
  return match.slice(1).map(Number);
}

function gte(version, minimum) {
  const actual = parseVersion(version);
  const required = parseVersion(minimum);
  if (!actual || !required) return false;
  for (let i = 0; i < required.length; i += 1) {
    if (actual[i] > required[i]) return true;
    if (actual[i] < required[i]) return false;
  }
  return true;
}

const failures = [];

for (const packagePath of workspacePackages) {
  const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ]) {
    for (const [name, version] of Object.entries(manifest[field] ?? {})) {
      if (!monitored.has(name)) continue;
      if (name === 'vitest' && !gte(version, MIN_SAFE_VITEST)) {
        failures.push(`${packagePath}: ${name}@${version} is below ${MIN_SAFE_VITEST}`);
      }
      if (name === '@vitest/coverage-v8' && version !== MIN_SAFE_VITEST) {
        failures.push(
          `${packagePath}: ${name}@${version} must stay aligned with vitest@${MIN_SAFE_VITEST}`
        );
      }
      if (
        name === '@vitest/ui' ||
        name === '@vitest/browser' ||
        name === '@vitest/coverage-istanbul'
      ) {
        failures.push(
          `${packagePath}: ${name} is not approved for OCTO; do not add Vitest UI/browser mode dependencies`
        );
      }
      if (name === 'vite-node') {
        failures.push(
          `${packagePath}: vite-node must not be installed directly; Vitest 4 no longer requires it for OCTO tests`
        );
      }
      if (name === 'vite' && !gte(version, MIN_SAFE_VITE)) {
        failures.push(`${packagePath}: ${name}@${version} is below ${MIN_SAFE_VITE}`);
      }
    }
  }
}

const lockfile = readFileSync('pnpm-lock.yaml', 'utf8');
const vulnerableLockPatterns = [
  /(^|\n)\s{2}vitest@(?:[0-3]\.|4\.0\.|4\.1\.[0-7]\b)/,
  /(^|\n)\s{2}'?@vitest\/[^@']+@(?:[0-3]\.|4\.0\.|4\.1\.[0-7]\b)/,
  /(^|\n)\s{2}vite-node@/,
  /(^|\n)\s{2}'?@vitest\/ui@/,
  /(^|\n)\s{2}'?@vitest\/browser@/,
  /(^|\n)\s{2}'?@vitest\/coverage-istanbul@/,
];
for (const pattern of vulnerableLockPatterns) {
  if (pattern.test(lockfile)) {
    failures.push(
      `pnpm-lock.yaml contains a forbidden or vulnerable Vitest-family package matching ${pattern}`
    );
  }
}

const workspace = readFileSync(join('pnpm-workspace.yaml'), 'utf8');
for (const expected of [
  `vitest: '${MIN_SAFE_VITEST}'`,
  `'@vitest/coverage-v8': '${MIN_SAFE_VITEST}'`,
  `vite: '${MIN_SAFE_VITE}'`,
]) {
  if (!workspace.includes(expected)) {
    failures.push(`pnpm-workspace.yaml is missing centralized override ${expected}`);
  }
}

if (failures.length > 0) {
  console.error('Vitest security policy failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Vitest security policy passed: vitest >= ${MIN_SAFE_VITEST}, vite >= ${MIN_SAFE_VITE}, no Vitest UI/browser/vite-node install surface.`
);
