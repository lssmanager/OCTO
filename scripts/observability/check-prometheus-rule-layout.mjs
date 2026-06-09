import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const productionRulesDir = path.join(repoRoot, 'infra/prometheus/rules');
const testRulesDir = path.join(repoRoot, 'infra/prometheus/tests');
const prometheusConfigPath = path.join(repoRoot, 'infra/prometheus/prometheus.yml');
const composePath = path.join(repoRoot, 'infra/docker-compose.observability.yml');
const expectedRuleGlob = '/etc/prometheus/rules/*.rules.yml';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function walk(dir) {
  if (!existsSync(dir)) {
    return [];
  }

  const entries = readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walk(entryPath));
      continue;
    }
    files.push(entryPath);
  }
  return files;
}

const prometheusConfig = readFileSync(prometheusConfigPath, 'utf8');
if (!prometheusConfig.includes(`  - ${expectedRuleGlob}`)) {
  fail(`prometheus.yml must load only ${expectedRuleGlob}`);
}

if (prometheusConfig.includes('/etc/prometheus/rules/*.yml')) {
  fail('prometheus.yml still uses the broad *.yml production glob');
}

const composeConfig = readFileSync(composePath, 'utf8');
if (!composeConfig.includes('./prometheus/rules:/etc/prometheus/rules:ro')) {
  fail('docker-compose.observability.yml must mount only the production rules directory into /etc/prometheus/rules');
}

const productionRuleFiles = walk(productionRulesDir).filter((file) => file.endsWith('.yml'));
if (productionRuleFiles.length === 0) {
  fail('No production Prometheus rules were found under infra/prometheus/rules');
}

for (const file of productionRuleFiles) {
  const relativePath = path.relative(repoRoot, file);
  const baseName = path.basename(file);
  if (!baseName.endsWith('.rules.yml')) {
    fail(`Production rules directory may only contain *.rules.yml files: ${relativePath}`);
  }
  if (baseName.includes('.test.') || baseName.includes('-test')) {
    fail(`Test fixture leaked into production rules directory: ${relativePath}`);
  }
}

const testFixtureFiles = walk(testRulesDir).filter((file) => file.endsWith('.yml'));
if (testFixtureFiles.length === 0) {
  fail('No Prometheus test fixtures were found under infra/prometheus/tests');
}

for (const file of testFixtureFiles) {
  const relativePath = path.relative(repoRoot, file);
  const baseName = path.basename(file);
  if (!baseName.endsWith('.test.yml') && !baseName.endsWith('-test.yml')) {
    fail(`Prometheus test fixtures must use a *.test.yml or *-test.yml suffix: ${relativePath}`);
  }

  const testContents = readFileSync(file, 'utf8');
  if (!/rule_files:\s*\n\s*-\s+\.\.\/rules\/.+\.rules\.yml/m.test(testContents)) {
    fail(`Prometheus test fixture must reference production rules via ../rules/*.rules.yml: ${relativePath}`);
  }
}

console.log(
  `Prometheus rule layout validated. Production files: ${productionRuleFiles.length}, test fixtures: ${testFixtureFiles.length}.`,
);
