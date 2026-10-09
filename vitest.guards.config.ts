import { defineConfig } from 'vitest/config';

/**
 * The guards suite (#475): tests that read or parse the whole repository to
 * check a rule across it, or run its whole toolchain (the ESLint plant).
 * Their cost is the tree, not a unit of code, so they run here, under one
 * measured limit at their CI step, and the unit suite leaves them out
 * (global rule, 2026-10-08).
 */
export default defineConfig({
  test: {
    include: ['tests/guards/**/*.test.ts'],
    // One limit, at the CI step (#476): none per test or per hook.
    testTimeout: 0,
    hookTimeout: 0,
  },
});
