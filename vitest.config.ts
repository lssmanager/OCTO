import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = (name: string) => resolve(__dirname, `packages/${name}/src/index.ts`);

export default defineConfig({
  resolve: {
    alias: {
      '@octo/config': pkg('config'),
      '@octo/contracts': pkg('contracts'),
      '@octo/database': pkg('database'),
      '@octo/events': pkg('events'),
      '@octo/observability': pkg('observability'),
      '@octo/queue': pkg('queue'),
      '@octo/runtime-state': pkg('runtime-state'),
      '@octo/security': pkg('security'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
  },
});
