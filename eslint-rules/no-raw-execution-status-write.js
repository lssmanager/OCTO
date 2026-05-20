/**
 * ESLint rule: no-raw-execution-status-write
 *
 * Prevents direct DB writes to the `status` column of the `executions` table
 * outside of `packages/runtime-state/src/`.
 *
 * CORRECT: Call ExecutionStateService.transition() — it enforces the FSM,
 *          performs the CAS UPDATE, and emits an execution_event.
 * WRONG:   db.update(executions).set({ status: 'running' }) anywhere else.
 *
 * ADR: F0-017 (State Machine CAS enforcement)
 * Related: packages/runtime-state/src/execution-state.service.ts
 */

'use strict';

/** @type {import('eslint').Rule.RuleModule} */
module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'Disallow raw execution status writes outside of @octo/runtime-state. ' +
        'Use ExecutionStateService.transition() instead.',
      url: 'https://github.com/lssmanager/OCTO/blob/main/docs/adr/ADR-0017-state-machine.md',
    },
    messages: {
      noRawStatusWrite:
        'Direct execution status write detected. ' +
        'Use ExecutionStateService.transition() from @octo/runtime-state instead. ' +
        'Raw writes bypass the FSM CAS guard and will cause state corruption.',
    },
    schema: [],
  },

  create(context) {
    const filename = context.getFilename();

    // Allow writes inside runtime-state package (that is the FSM authority)
    if (
      filename.includes('packages/runtime-state/') ||
      filename.includes('packages\\runtime-state\\')
    ) {
      return {};
    }

    // Allow test files — tests may need to seed DB state directly
    if (
      filename.includes('.spec.') ||
      filename.includes('.test.') ||
      filename.includes('__tests__')
    ) {
      return {};
    }

    return {
      // Detect: .set({ status: ... }) chained after any expression
      // This catches:
      //   db.update(executions).set({ status: 'running' })
      //   await db.update(executions).set({ status: ExecutionStatus.COMPLETED })
      CallExpression(node) {
        if (
          node.callee.type === 'MemberExpression' &&
          node.callee.property.type === 'Identifier' &&
          node.callee.property.name === 'set'
        ) {
          const args = node.arguments;
          if (args.length === 0) return;

          const firstArg = args[0];
          if (firstArg.type !== 'ObjectExpression') return;

          const hasStatusKey = firstArg.properties.some(
            (prop) =>
              prop.type === 'Property' &&
              ((prop.key.type === 'Identifier' && prop.key.name === 'status') ||
                (prop.key.type === 'Literal' && prop.key.value === 'status')),
          );

          if (!hasStatusKey) return;

          // Check if this .set() is chained from .update(...) which references executions
          // We check the callee chain for an `update` call
          let callee = node.callee.object;
          while (callee) {
            if (
              callee.type === 'CallExpression' &&
              callee.callee.type === 'MemberExpression' &&
              callee.callee.property.type === 'Identifier' &&
              callee.callee.property.name === 'update'
            ) {
              // Check if any argument to .update() references 'executions'
              const updateArgs = callee.arguments;
              const referencesExecutions = updateArgs.some(
                (arg) =>
                  (arg.type === 'Identifier' && arg.name === 'executions') ||
                  (arg.type === 'MemberExpression' &&
                    arg.property.type === 'Identifier' &&
                    arg.property.name === 'executions'),
              );

              if (referencesExecutions) {
                context.report({
                  node,
                  messageId: 'noRawStatusWrite',
                });
              }
              break;
            }
            callee = callee.callee?.object ?? null;
          }
        }
      },
    };
  },
};
