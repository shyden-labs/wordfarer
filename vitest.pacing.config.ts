import { defineConfig } from 'vitest/config';

/**
 * The pacing suite (#35): the personas play the real core and the spec's
 * targets are checked. It runs as its own CI step, under one measured limit
 * there and none per test or per hook (#476), so it is kept out of the root
 * suite.
 */
export default defineConfig({
  test: {
    include: ['packages/bots/pacing/**/*.test.ts'],
    testTimeout: 0,
    hookTimeout: 0,
  },
});
