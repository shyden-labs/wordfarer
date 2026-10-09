import { defineConfig } from 'vitest/config';

/**
 * The unit suite: tests/unit and every workspace that runs in plain Node.
 * apps/sync-worker is not included: its tests drive wrangler's harness,
 * under its own config (npm run test:worker).
 *
 * Every unit test runs in under 1 s, and no limit is ever raised (global
 * rule, 2026-10-07; #477): a hook is held to the same second. The setup
 * fails a test over 1 s of its own CPU, and refuses every process start and
 * outside socket (tests/unit/setup.ts).
 */
export default defineConfig({
  test: {
    testTimeout: 1_000,
    hookTimeout: 1_000,
    setupFiles: ['tests/unit/setup.ts'],
    include: [
      'tests/**/*.test.ts',
      'apps/web/**/*.test.ts',
      'apps/site/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
    ],
    // apps/web/test and apps/site/test drive the built dev Workers through
    // wrangler's harness, so they run after a build, under each workspace's
    // own config.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'apps/web/test/**',
      'apps/site/test/**',
      // The whole-repo guards are their own suite (vitest.guards.config.ts).
      'tests/guards/**',
      // Tests that start a process are their own suite (vitest.integration.config.ts).
      'tests/integration/**',
    ],
  },
});
