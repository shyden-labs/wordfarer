import { expect, it } from 'vitest';

// Fails on purpose: #353 AC4's live proof that a red unit step skips the
// pacing-report upload. This branch is never merged.
it('fails on purpose, so the unit step is red (#353 AC4)', () => {
  expect('red').toBe('green');
});
