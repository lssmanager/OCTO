// eslint.config.js — ESLint 9 flat config with dependency boundary enforcement
// OCTO Monorepo — Dependency Direction Rules (Architectural Principle #1)
//
// Zone topology:
//
//  leaf (contracts, config, prompts)
//    ↑          no internal imports
//  infra (database, events, queue, security, observability)
//    ↑          ← leaf only
//  sdk  (sdk-abstractions, agent-core)
//    ↑          ← leaf + infra
//  ui   (ui)
//    ↑          ← leaf only
//  app  (apps/*)
//               ← leaf + infra + sdk + ui
//               ✗ never imports another app directly

import boundaries from 'eslint-plugin-boundaries';
import tsParser from '@typescript-eslint/parser';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    // Apply to all TS sources in packages/ and apps/
    files: ['packages/**/*.ts', 'apps/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
      },
    },
    plugins: {
      boundaries,
    },
    settings: {
      'boundaries/elements': [
        {
          // Leaf packages: data/schemas only, no internal imports allowed
          type: 'leaf',
          pattern: [
            'packages/contracts/*',
            'packages/config/*',
            'packages/prompts/*',
          ],
          mode: 'folder',
        },
        {
          // Infra packages: persistence, transport, observability, security
          type: 'infra',
          pattern: [
            'packages/database/*',
            'packages/events/*',
            'packages/queue/*',
            'packages/security/*',
            'packages/observability/*',
          ],
          mode: 'folder',
        },
        {
          // SDK / agent core: business logic abstractions
          type: 'sdk',
          pattern: [
            'packages/sdk-abstractions/*',
            'packages/agent-core/*',
          ],
          mode: 'folder',
        },
        {
          // UI components: presentational layer
          type: 'ui',
          pattern: ['packages/ui/*'],
          mode: 'folder',
        },
        {
          // Apps: deployable services
          type: 'app',
          pattern: ['apps/*'],
          mode: 'folder',
        },
      ],
      'boundaries/ignore': [
        // Ignore node_modules and dist output
        '**/*.d.ts',
        '**/dist/**',
        '**/node_modules/**',
      ],
    },
    rules: {
      // Leaf packages must not import from any internal package
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            // leaf → (nothing internal)
            {
              from: 'leaf',
              allow: [],
            },
            // infra → leaf only
            {
              from: 'infra',
              allow: ['leaf'],
            },
            // sdk → leaf + infra
            {
              from: 'sdk',
              allow: ['leaf', 'infra'],
            },
            // ui → leaf only
            {
              from: 'ui',
              allow: ['leaf'],
            },
            // app → leaf + infra + sdk + ui, never another app
            {
              from: 'app',
              allow: ['leaf', 'infra', 'sdk', 'ui'],
            },
          ],
        },
      ],
    },
  },
];
