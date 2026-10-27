import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    testTimeout: 30000,
    hookTimeout: 60000,
    // Tests share one test database; run files sequentially to keep the
    // FR-09 concurrency assertions deterministic.
    fileParallelism: false,
    setupFiles: ['./tests/setup.js'],
  },
});
