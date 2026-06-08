#!/usr/bin/env node
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

async function text(path) {
  return readFile(join(root, path), 'utf8');
}

function matchScalar(source, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`^\\s*${escaped}:\\s*['\"]?([^'\"\\n#]+)['\"]?`, 'm'))?.[1]?.trim();
}

function normalizeConfigValue(value) {
  return value.trim().replace(/^['\"]|['\"]$/g, '');
}

function readPnpmConfig(key) {
  const result = spawnSync('pnpm', ['config', 'get', key], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    fail(`Unable to read effective pnpm config for ${key}: ${result.stderr || result.stdout || 'unknown error'}`);
    return null;
  }
  return normalizeConfigValue(result.stdout || '');
}

function expectPnpmConfig(key, expected) {
  const actual = readPnpmConfig(key);
  if (actual === null) return;
  if (actual !== expected) {
    fail(`Effective pnpm config ${key} must be ${expected}, found ${actual || 'missing'}`);
  }
}

async function workspacePackageJsonFiles(dir = root) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === 'dist' || entry.name === '.next') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) files.push(...(await workspacePackageJsonFiles(path)));
    else if (entry.name === 'package.json') files.push(path);
  }
  return files;
}

async function checkWorkspacePackageManifests(rootTypescript) {
  const drift = [];
  for (const file of await workspacePackageJsonFiles()) {
    const manifest = JSON.parse(await readFile(file, 'utf8'));
    const typescript = manifest.devDependencies?.typescript ?? manifest.dependencies?.typescript;
    if (typescript && typescript !== rootTypescript) {
      drift.push(`${file.replace(`${root}/`, '')}=${typescript}`);
    }
  }
  if (drift.length > 0) {
    fail(`Workspace TypeScript manifest drift from ${rootTypescript}: ${drift.join(', ')}`);
  }
}

function checkLockfileAlignment(packageJson, workspaceYaml, lockYaml) {
  const packageManager = packageJson.packageManager;
  const rootTypescript = packageJson.devDependencies?.typescript;
  const workspaceTypescript = matchScalar(workspaceYaml, 'typescript');
  const lockTypescript = matchScalar(lockYaml, 'typescript');
  const lintStaged = packageJson.devDependencies?.['lint-staged'];
  const injectWorkspacePackages = /settings:\s*[\s\S]*?injectWorkspacePackages:\s*true/m.test(workspaceYaml);

  if (packageManager !== 'pnpm@11.2.2') {
    fail(`packageManager must stay pinned to pnpm@11.2.2, found ${packageManager ?? 'missing'}`);
  }
  if (packageJson.engines?.node !== '>=22.22.1') {
    fail(`engines.node must enforce the supported F1 Node floor >=22.22.1, found ${packageJson.engines?.node ?? 'missing'}`);
  }
  if (packageJson.engines?.pnpm !== '>=11.2.2 <12') {
    fail(`engines.pnpm must enforce pnpm 11.2.2-compatible installs, found ${packageJson.engines?.pnpm ?? 'missing'}`);
  }
  if (rootTypescript !== workspaceTypescript || rootTypescript !== lockTypescript) {
    fail(`TypeScript drift: package.json=${rootTypescript}, pnpm-workspace.yaml=${workspaceTypescript}, pnpm-lock.yaml=${lockTypescript}`);
  }
  if (rootTypescript !== '5.9.3') {
    fail(`F1 TypeScript pin must remain 5.9.3 until the documented TS 6.x retirement condition is met, found ${rootTypescript}`);
  }
  if (lintStaged !== '17.0.7') {
    fail(`lint-staged must remain aligned with the main lockfile on 17.0.7, found ${lintStaged ?? 'missing'}`);
  }
  if (!injectWorkspacePackages) {
    fail('pnpm-workspace.yaml must keep settings.injectWorkspacePackages=true as the project-level source of truth');
  }
}

function checkEffectivePnpmPolicy() {
  expectPnpmConfig('engine-strict', 'true');
  expectPnpmConfig('strict-peer-dependencies', 'false');
  expectPnpmConfig('auto-install-peers', 'true');
  expectPnpmConfig('shamefully-hoist', 'true');
  expectPnpmConfig('link-workspace-packages', 'true');
  expectPnpmConfig('inject-workspace-packages', 'true');
  expectPnpmConfig('minimum-release-age', '1440');
}

async function checkCjsUnderRootEsm(packageJson) {
  if (packageJson.type !== 'module') return;
  const rootFiles = await readdir(root);
  const badFiles = [];
  for (const file of rootFiles) {
    if (!file.endsWith('.config.js')) continue;
    const source = await text(file);
    if (/\bmodule\.exports\b/.test(source) && !file.endsWith('.cjs')) {
      badFiles.push(file);
    }
  }
  if (badFiles.length > 0) {
    fail(`CommonJS config files under root type=module must use .cjs: ${badFiles.join(', ')}`);
  }
}

function checkTurboTelemetry(packageJson, ciYaml, contractsYaml) {
  const turboScripts = Object.entries(packageJson.scripts ?? {}).filter(([, command]) => /(^|\s)turbo(\s|$)|turbo run/.test(command));
  const missingScriptOptOut = turboScripts
    .filter(([, command]) => !command.includes('TURBO_TELEMETRY_DISABLED=1'))
    .map(([name]) => name);
  if (missingScriptOptOut.length > 0) {
    fail(`Turbo scripts must set TURBO_TELEMETRY_DISABLED=1 explicitly: ${missingScriptOptOut.join(', ')}`);
  }
  for (const [path, source] of [
    ['.github/workflows/ci.yml', ciYaml],
    ['.github/workflows/contracts.yml', contractsYaml],
  ]) {
    if (!source.includes('TURBO_TELEMETRY_DISABLED:')) {
      fail(`${path} must expose TURBO_TELEMETRY_DISABLED in workflow env`);
    }
  }
}

async function checkDockerSyntaxDirectives() {
  const required = [
    'docker/api.Dockerfile',
    'docker/runtime-worker.Dockerfile',
    'docker/scheduler-worker.Dockerfile',
    'docker/reclaimer-worker.Dockerfile',
    'docker/migrate.Dockerfile',
  ];
  for (const path of required) {
    const source = await text(path);
    const firstLine = source.split(/\r?\n/, 1)[0];
    if (!firstLine.startsWith('# syntax=docker/dockerfile:')) {
      fail(`${path} must put an effective # syntax= directive on line 1`);
    }
  }
}

async function runGate() {
  const packageJson = JSON.parse(await text('package.json'));
  const [workspaceYaml, lockYaml, ciYaml, contractsYaml] = await Promise.all([
    text('pnpm-workspace.yaml'),
    text('pnpm-lock.yaml'),
    text('.github/workflows/ci.yml'),
    text('.github/workflows/contracts.yml'),
  ]);

  checkLockfileAlignment(packageJson, workspaceYaml, lockYaml);
  await checkWorkspacePackageManifests(packageJson.devDependencies?.typescript);
  checkEffectivePnpmPolicy();
  await checkCjsUnderRootEsm(packageJson);
  checkTurboTelemetry(packageJson, ciYaml, contractsYaml);
  await checkDockerSyntaxDirectives();

  if (failures.length > 0) {
    console.error('F1 tooling gate failed:');
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log('F1 tooling gate passed: lockfile/tooling policy/telemetry/Dockerfile directives are aligned.');
}

function expectFailure(fn, expected) {
  failures.length = 0;
  fn();
  assert.ok(failures.some((failure) => failure.includes(expected)), `expected failure containing ${expected}, got ${failures.join('; ')}`);
}

async function runSelfTest() {
  expectFailure(
    () => checkLockfileAlignment(
      { packageManager: 'pnpm@11.2.2', engines: { node: '>=22.22.1', pnpm: '>=11.2.2 <12' }, devDependencies: { typescript: '6.0.3', 'lint-staged': '17.0.7' } },
      'settings:\n  injectWorkspacePackages: true\noverrides:\n  typescript: \'5.9.3\'\n',
      'settings:\n  injectWorkspacePackages: true\n  typescript: 5.9.3\n',
    ),
    'TypeScript drift',
  );
  expectFailure(
    () => checkTurboTelemetry(
      { scripts: { build: 'turbo build' } },
      'name: CI\nenv:\n  TURBO_TELEMETRY_DISABLED: \'1\'\n',
      'name: Contracts\nenv:\n  TURBO_TELEMETRY_DISABLED: \'1\'\n',
    ),
    'Turbo scripts',
  );

  const tmp = mkdtempSync(join(tmpdir(), 'octo-f1-tooling-'));
  try {
    writeFileSync(join(tmp, 'bad.config.js'), 'module.exports = {};\n');
    const originalCwd = process.cwd();
    process.chdir(tmp);
    failures.length = 0;
    const rootFiles = await readdir(tmp);
    const badFiles = [];
    for (const file of rootFiles) {
      if (!file.endsWith('.config.js')) continue;
      const source = await readFile(join(tmp, file), 'utf8');
      if (/\bmodule\.exports\b/.test(source)) badFiles.push(file);
    }
    if (badFiles.length > 0) fail(`CommonJS config files under root type=module must use .cjs: ${badFiles.join(', ')}`);
    assert.ok(failures.some((failure) => failure.includes('CommonJS config files')), 'expected CJS config naming failure');
    process.chdir(originalCwd);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  failures.length = 0;
  const dockerFirstLine = 'FROM node:22.22.2-alpine3.22 AS builder\n';
  if (!dockerFirstLine.split(/\r?\n/, 1)[0].startsWith('# syntax=docker/dockerfile:')) {
    fail('docker/api.Dockerfile must put an effective # syntax= directive on line 1');
  }
  assert.ok(failures.some((failure) => failure.includes('syntax= directive on line 1')), 'expected Dockerfile syntax directive failure');

  failures.length = 0;
  console.log('F1 tooling gate self-tests passed.');
}

if (process.argv.includes('--self-test')) {
  await runSelfTest();
} else {
  await runGate();
}
