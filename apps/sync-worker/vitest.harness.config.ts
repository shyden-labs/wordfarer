import { defineConfig } from 'vitest/config';

/**
 * The sync Worker's harness tests (#506). They run in Node and drive
 * wrangler's test harness, which builds src/index.ts from the real
 * wrangler.jsonc and serves it on the workerd wrangler deploys with, against
 * a real local D1 (spec §12.4). Every case runs inside workerd: the ones that
 * need an environment no deploy has go to a test-only wrapper Worker in the
 * same harness (wrangler.injected.jsonc), held equal to wrangler.jsonc but for
 * its name and entry point, so no test passes against a binding the deployed
 * Worker does not have.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // One limit, at the CI step (#476): none per test or per hook.
    testTimeout: 0,
    hookTimeout: 0,
  },
});
