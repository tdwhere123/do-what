import path from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@do-what/protocol': path.resolve(__dirname, '../protocol/src/index.ts'),
    },
  },
  test: {
    pool: 'threads',
    maxWorkers: 1,
    minWorkers: 1,
  },
});
