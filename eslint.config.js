// eslint.config.js — ESLint 9 flat config
// OCTO Monorepo — Architectural boundary enforcement (Issue #41)
//
// Zone topology (dependency direction is strictly downward):
//
//   leaf        (contracts, config, prompts)
//     ↑           zero internal @octo/* imports allowed
//   infra       (database, events, queue, security, observability, runtime-state)
//     ↑           ← leaf only
//   sdk         (sdk-abstractions, agent-core)
//     ↑           ← leaf + infra
//   ui          (packages/ui)
//     ↑           ← leaf only
//   app         (apps/api, apps/web, apps/*-worker)
//               ← leaf + infra + sdk + ui
//               ✗ never imports another app directly
//
// Specific rules enforced (issue #41):
//   [R1] frontend ✗ database    → frontend allow: leaf + sdk + ui (no infra)
//   [R2] frontend ✗ queue       → same
//   [R3] frontend ✗ agent-core  → sdk is allowed but only via allowed zone
//   [R4] reclaimer ✗ @nestjs/*  → reclaimer allow: leaf + infra only
//   [R5] agent-core ✗ bullmq    → sdk allow: leaf + infra (bullmq is external;
//                                  agent-core must import @octo/queue, not bullmq)
//   [R6] contracts ✗ @octo/*    → leaf allow: [] (zero internal deps)
//   [R7] workers adapter-only   → worker allow: leaf + infra + sdk (no ui)
//
// NOTE: boundaries/no-unknown is intentionally OFF.
// It fires on every node_modules import (@nestjs/*, bullmq, drizzle-orm, etc.)
// which are all valid external dependencies — not architectural violations.
// The element-types rule is sufficient to enforce the internal DAG topology.

import boundaries from 'eslint-plugin-boundaries';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

// Custom rules
const noRawExecutionStatusWrite = require('./eslint-rules/no-raw-execution-status-write.cjs');

// eslint-plugin-boundaries 5.x still calls the pre-ESLint-10 context.getFilename()
// helper. Keep the architectural rules active while running on ESLint 10 by
// providing the compatibility method from the new context filename fields.
for (const ruleName of ['element-types', 'no-unknown']) {
  const rule = boundaries.rules?.[ruleName];
  if (rule?.create) {
    const create = rule.create.bind(rule);
    rule.create = (context) => {
      const compatContext = Object.create(context);
      Object.defineProperties(compatContext, {
        getFilename: {
          value: () => context.filename ?? context.physicalFilename ?? '<unknown>',
        },
        getPhysicalFilename: {
          value: () => context.physicalFilename ?? context.filename ?? '<unknown>',
        },
      });
      return create(compatContext);
    };
  }
}

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Ignore generated/build outputs globally ───────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.next/**',
      '**/*.d.ts',
      '**/generated/**',
      'drizzle/**',
      'docs/**',
      'infra/**',
      'scripts/**',
    ],
  },

  // ── TypeScript + Boundaries: all packages and apps ────────────────────────
  {
    files: ['packages/**/*.ts', 'packages/**/*.tsx', 'apps/**/*.ts', 'apps/**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      boundaries,
      '@typescript-eslint': tsPlugin,
      'octo-local': {
        rules: {
          'no-raw-execution-status-write': noRawExecutionStatusWrite,
        },
      },
    },
    settings: {
      // Only evaluate imports that are internal workspace packages (@octo/*)
      // or relative paths. External node_modules are ignored by the plugin.
      'boundaries/include-paths': ['@octo/*', './*/src/**', '../*/src/**'],
      'boundaries/elements': [
        {
          type: 'leaf',
          pattern: 'packages/(contracts|config|prompts)/**/*',
          capture: ['pkg'],
        },
        {
          type: 'infra',
          pattern: 'packages/(database|events|queue|security|observability|runtime-state)/**/*',
          capture: ['pkg'],
        },
        {
          type: 'sdk',
          pattern: 'packages/(sdk-abstractions|agent-core)/**/*',
          capture: ['pkg'],
        },
        {
          type: 'ui',
          pattern: 'packages/ui/**/*',
          capture: ['pkg'],
        },
        {
          type: 'frontend',
          pattern: 'apps/web/**/*',
          capture: ['app'],
        },
        {
          type: 'api',
          pattern: 'apps/api/**/*',
          capture: ['app'],
        },
        {
          type: 'reclaimer',
          pattern: 'apps/reclaimer-worker/**/*',
          capture: ['app'],
        },
        {
          type: 'worker',
          pattern: 'apps/*-worker/**/*',
          capture: ['app'],
        },
      ],
      'boundaries/ignore': ['**/*.d.ts', '**/dist/**', '**/.next/**', '**/node_modules/**'],
    },
    rules: {
      // Enforce the internal DAG topology for all @octo/* cross-package imports
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // [R6] leaf → nothing internal
            { from: 'leaf', allow: [] },
            // infra → leaf only
            { from: 'infra', allow: ['leaf'] },
            // [R5] sdk: leaf + infra (bullmq via @octo/queue only)
            { from: 'sdk', allow: ['leaf', 'infra'] },
            // ui → leaf only
            { from: 'ui', allow: ['leaf'] },
            // [R1][R2][R3] frontend: leaf + sdk + ui (NOT infra)
            { from: 'frontend', allow: ['leaf', 'sdk', 'ui'] },
            // api → full internal stack
            { from: 'api', allow: ['leaf', 'infra', 'sdk', 'ui'] },
            // [R4] reclaimer → leaf + infra only (no @nestjs/* = no sdk)
            { from: 'reclaimer', allow: ['leaf', 'infra'] },
            // [R7] workers → leaf + infra + sdk (adapter-only, no UI)
            { from: 'worker', allow: ['leaf', 'infra', 'sdk'] },
          ],
        },
      ],

      // External deps (node_modules) are valid; only flag truly unknown
      // internal imports that don't match any element pattern.
      'boundaries/no-unknown': 'error',

      // [ADR-0017] Prevent raw execution status writes outside runtime-state.
      // Use ExecutionStateService.transition() instead.
      'octo-local/no-raw-execution-status-write': 'error',
    },
  },
];
