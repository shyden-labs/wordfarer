import { expect, it } from 'vitest';

// #348 AC7's throwaway pull request, closed unmerged: commit 2 of 3 is red on purpose.
it('adds', () => {
  expect(1 + 1).toBe(2);
});
