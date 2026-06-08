// eslint.config.js - ESLint flat config
// OCTO Monorepo - Architectural boundary enforcement (Issue #41, #275)
//
// Zone topology (dependency direction is strictly downward):
//
//   leaf          (contracts, config, prompts)
//     ^             zero internal @octo/* imports allowed
//   infra         (database, events, queue, security, observability, runtime-state)
//     ^             <- leaf only
//   provider-sdk  (sdk-abstractions)
//     ^             <- leaf only; external SDK isolation lives here
//   agent-core    (hierarchy, graph, delegation, authority)
//     ^             <- leaf + infra + provider-sdk
//   ui            (packages/ui)
//     ^             <- leaf only
//   frontend      (apps/web)
//                 <- leaf + provider-sdk + ui
//                 x no infra, control-plane or runtime imports
//   control-plane (apps/api)
//                 <- leaf + infra + provider-sdk + agent-core + ui
//   runtime       (apps/runtime-worker)
//                 <- leaf + infra + provider-sdk + agent-core
//                 x no control-plane, frontend or ui imports
//   workers       (apps/*-worker)
//                 <- leaf + infra + provider-sdk + agent-core
//                 x no frontend/ui imports and no direct app-to-app imports
//
// Specific rules enforced:
//   [R1] frontend x database/queue/runtime-state/security/observability
//   [R2] frontend x agent-core/runtime/control-plane
//   [R3] runtime x frontend/control-plane/ui
//   [R4] reclaimer x @nestjs/* by allowing only leaf + infra internals
//   [R5] agent-core x direct queue implementation detail imports through zones;
//        BullMQ access belongs behind @octo/queue adapters
//   [R6] contracts/config/prompts x @octo/*
//   [R7] workers adapter-only: no UI and no direct app-to-app imports
//   [R8] provider SDK packages stay behind packages/sdk-abstractions; direct
//        external provider SDK imports are blocked everywhere else.
//

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
  // Global ignores for generated/build outputs.
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

  // TypeScript + Boundaries: all packages and apps.
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
          type: 'provider-sdk',
          pattern: 'packages/sdk-abstractions/**/*',
          capture: ['pkg'],
        },
        {
          type: 'agent-core',
          pattern: 'packages/agent-core/**/*',
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
          type: 'control-plane',
          pattern: 'apps/api/**/*',
          capture: ['app'],
        },
        {
          type: 'runtime',
          pattern: 'apps/runtime-worker/**/*',
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
      // Enforce the internal DAG topology for all @octo/* cross-package imports.
      'boundaries/element-types': [
        'error',
        {
          default: 'disallow',
          rules: [
            { from: 'leaf', allow: [] },
            { from: 'infra', allow: ['leaf'] },
            { from: 'provider-sdk', allow: ['leaf'] },
            { from: 'agent-core', allow: ['leaf', 'infra', 'provider-sdk'] },
            { from: 'ui', allow: ['leaf'] },
            { from: 'frontend', allow: ['leaf', 'provider-sdk', 'ui'] },
            { from: 'control-plane', allow: ['leaf', 'infra', 'provider-sdk', 'agent-core', 'ui'] },
            { from: 'runtime', allow: ['leaf', 'infra', 'provider-sdk', 'agent-core'] },
            { from: 'reclaimer', allow: ['leaf', 'infra'] },
            { from: 'worker', allow: ['leaf', 'infra', 'provider-sdk', 'agent-core'] },
          ],
        },
      ],

      // External deps (node_modules) are valid by default, but direct provider
      // SDK imports are not: those belong behind packages/sdk-abstractions.
      'boundaries/no-unknown': 'error',
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: 'openai', message: 'Use @octo/sdk-abstractions instead of importing provider SDKs directly.' },
            { name: 'anthropic', message: 'Use @octo/sdk-abstractions instead of importing provider SDKs directly.' },
            { name: '@anthropic-ai/sdk', message: 'Use @octo/sdk-abstractions instead of importing provider SDKs directly.' },
            { name: '@google/generative-ai', message: 'Use @octo/sdk-abstractions instead of importing provider SDKs directly.' },
            { name: 'google-generativeai', message: 'Use @octo/sdk-abstractions instead of importing provider SDKs directly.' },
            { name: 'ai', message: 'Use @octo/sdk-abstractions instead of importing provider SDKs directly.' },
          ],
          patterns: [
            { group: ['@ai-sdk/*'], message: 'Use @octo/sdk-abstractions instead of importing provider SDKs directly.' },
          ],
        },
      ],

      // [ADR-0017] Prevent raw execution status writes outside runtime-state.
      // Use ExecutionStateService.transition() instead.
      'octo-local/no-raw-execution-status-write': 'error',
    },
  },
  // Provider SDK abstraction package is the only TypeScript zone allowed to
  // import provider SDKs directly.
  {
    files: ['packages/sdk-abstractions/**/*.ts', 'packages/sdk-abstractions/**/*.tsx'],
    rules: {
      'no-restricted-imports': 'off',
    },
  },

];
