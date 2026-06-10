#!/usr/bin/env node
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const repoRoot = process.cwd();
const packageRoots = ['packages'];
const runtimeAllowList = new Set([
  './tsconfig.base.json',
  './tsconfig.node.json',
  './tsconfig.react.json',
  './tsconfig.json',
  './eslintrc.base.js',
]);
const problems = [];

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function visitExport(value, path, pkgName, trail = 'exports') {
  if (typeof value === 'string') {
    if ((value.endsWith('.ts') && !value.endsWith('.d.ts')) || value.includes('/src/')) {
      if (!runtimeAllowList.has(path)) {
        problems.push(`${pkgName}: ${trail} points at non-production source path ${value}`);
      }
    }
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, nested] of Object.entries(value)) {
      visitExport(nested, path, pkgName, `${trail}.${key}`);
    }
  }
}

for (const root of packageRoots) {
  for (const name of readdirSync(join(repoRoot, root)).sort()) {
    const pkgDir = join(repoRoot, root, name);
    if (!statSync(pkgDir).isDirectory()) continue;
    const pkgPath = join(pkgDir, 'package.json');
    const pkg = readJson(pkgPath);
    if (!pkg.name?.startsWith('@octo/')) continue;

    for (const field of ['main', 'module', 'types']) {
      const value = pkg[field];
      if (typeof value === 'string' && ((value.endsWith('.ts') && !value.endsWith('.d.ts')) || value.includes('/src/'))) {
        problems.push(`${pkg.name}: ${field} points at non-production source path ${value}`);
      }
    }

    if (pkg.exports) {
      for (const [path, value] of Object.entries(pkg.exports)) {
        visitExport(value, path, pkg.name, `exports.${path}`);
      }
    }

    if (pkg.main && !pkg.main.startsWith('./dist/')) {
      problems.push(`${pkg.name}: main must resolve to ./dist/* for production packages (found ${pkg.main})`);
    }
    if (pkg.types && !pkg.types.startsWith('./dist/')) {
      problems.push(`${pkg.name}: types must resolve to ./dist/* for production packages (found ${pkg.types})`);
    }

    const srcIndex = join(pkgDir, 'src', 'index.ts');
    if (statSync(join(pkgDir, 'src'), { throwIfNoEntry: false })?.isDirectory()) {
      if (!pkg.scripts?.build) {
        problems.push(`${pkg.name}: package with src/ is missing a build script`);
      }
      if (!pkg.files?.includes('dist')) {
        problems.push(`${pkg.name}: package with src/ must include dist in files[]`);
      }
    }
  }
}

if (problems.length) {
  console.error('Workspace packaging check failed:');
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}

console.log('Workspace packaging check passed: no @octo package exposes raw TypeScript runtime sources.');
