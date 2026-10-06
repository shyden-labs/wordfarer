import { defineConfig } from 'vitest/config';

/**
 * The root suite: repo guards (tests/) and every workspace that runs in plain
 * Node. apps/sync-worker is excluded because its tests run INSIDE workerd via
 * @cloudflare/vitest-pool-workers, under its own config (npm run test:worker).
 */
export default defineConfig({
  test: {
    include: [
      'tests/**/*.test.ts',
      'apps/web/**/*.test.ts',
      'apps/site/**/*.test.ts',
      'packages/*/test/**/*.test.ts',
    ],
    // apps/web/test drives the built dev Worker through wrangler's harness,
    // so it runs after a build, under the web workspace's own config.
    exclude: ['**/node_modules/**', '**/dist/**', 'apps/web/test/**'],
  },
});
