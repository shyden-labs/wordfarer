import { defineConfig } from 'vitest/config';

/**
 * The dev game Worker's harness tests (#332). They run in Node and drive
 * wrangler's test harness, which serves the Worker from the real
 * wrangler.jsonc through Cloudflare's asset router, the layer that decides
 * whether the Worker runs at all. The assets are ./dist, so `npm run test`
 * builds the game first.
 */
export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    hookTimeout: 60_000,
  },
});
