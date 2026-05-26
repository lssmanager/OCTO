import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/main.ts', 'src/index.ts'],
  format: ['cjs'],
  dts: false,
  external: ['@octo/queue', '@octo/database', 'drizzle-orm'],
  target: 'es2022',
});
