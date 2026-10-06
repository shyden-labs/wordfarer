import { defineConfig } from 'vitest/config';

/**
 * The dev hostname adapter's harness tests (#429). They run in Node and drive
 * wrangler's test harness, which serves the Function compiled by
 * `wrangler pages functions build` (the same compiler `wrangler pages deploy`
 * runs), so the tests reach the code that ships, not a stand-in. The `test`
 * script compiles it first, into the git-ignored .build.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    hookTimeout: 60_000,
  },
});
