/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'runtime-state-no-illegal-imports',
      severity: 'error',
      comment:
        'runtime-state only imports from @octo/contracts, @octo/database, @octo/observability',
      from: { path: '^src/' },
      to: {
        pathNot: [
          '@octo/contracts',
          '@octo/database',
          '@octo/observability',
          // node internals y devDeps
          '^node:',
          'vitest',
        ],
        // cualquier otro @octo/* está prohibido
        path: '^@octo/',
      },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
  },
};
