import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = (name: string) => resolve(__dirname, `../../packages/${name}/src/index.ts`);

export default defineConfig({
  resolve: {
    alias: {
      '@octo/queue': pkg('queue'), '@octo/observability': pkg('observability'), '@octo/database': pkg('database'), '@octo/events': pkg('events'), '@octo/runtime-state': pkg('runtime-state'), '@octo/config': pkg('config'), '@octo/security': pkg('security'), '@octo/contracts': pkg('contracts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    exclude: ['src/**/*.integration.test.ts'],
  },
});
