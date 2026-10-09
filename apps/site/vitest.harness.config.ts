import { defineConfig } from 'vitest/config';

/**
 * The dev site Worker's harness tests (#332). They run in Node and drive
 * wrangler's test harness, which serves the Worker from the real
 * wrangler.jsonc through Cloudflare's asset router, the layer
 * `run_worker_first` configures. The assets are ./dist, so `npm run test`
 * builds the site first.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    // One limit, at the CI step (#476): none per test or per hook.
    testTimeout: 0,
    hookTimeout: 0,
  },
});
