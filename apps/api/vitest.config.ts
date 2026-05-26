import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@octo/queue': resolve(__dirname, '../../packages/queue/src/index.ts'),
      '@octo/observability': resolve(__dirname, '../../packages/observability/src/index.ts'),
      '@octo/database': resolve(__dirname, '../../packages/database/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts', 'src/**/*.test.ts'],
    coverage: { provider: 'v8', reporter: ['text', 'json', 'html'], reportsDirectory: './coverage' },
  },
});
