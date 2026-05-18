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
// Specific rules from issue #41:
//   [R1] frontend ✗ database
//   [R2] frontend ✗ queue
//   [R3] frontend ✗ agent-core
//   [R4] reclaimer ✗ @nestjs/*  (framework-free worker)
//   [R5] agent-core ✗ bullmq direct (must go through @octo/queue)
//   [R6] contracts ✗ other @octo/* (zero internal deps)
//   [R7] channel-workers: adapter-only, no business logic imports

import boundaries from 'eslint-plugin-boundaries';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

/** @type {import('eslint').Linter.Config[]} */
export default [
  // ── Ignore generated/build outputs globally ───────────────────────────────
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
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
    },
    settings: {
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
      'boundaries/ignore': [
        '**/*.d.ts',
        '**/dist/**',
        '**/node_modules/**',
      ],
    },
    rules: {
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // [R6] leaf → nothing internal
            { from: 'leaf',      allow: [] },
            // infra → leaf only
            { from: 'infra',     allow: ['leaf'] },
            // [R5] sdk: leaf + infra only (bullmq must go via @octo/queue)
            { from: 'sdk',       allow: ['leaf', 'infra'] },
            // ui → leaf only
            { from: 'ui',        allow: ['leaf'] },
            // [R1][R2][R3] frontend: leaf + sdk + ui (NOT infra — no db/queue direct)
            { from: 'frontend',  allow: ['leaf', 'sdk', 'ui'] },
            // api → full stack
            { from: 'api',       allow: ['leaf', 'infra', 'sdk', 'ui'] },
            // [R4] reclaimer → leaf + infra only (no @nestjs/*, no sdk)
            { from: 'reclaimer', allow: ['leaf', 'infra'] },
            // [R7] workers → leaf + infra + sdk (adapter-only, no UI)
            { from: 'worker',    allow: ['leaf', 'infra', 'sdk'] },
          ],
        },
      ],
      'boundaries/no-unknown': 'error',
    },
  },
];
