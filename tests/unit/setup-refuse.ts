import { resolve } from 'node:path';
import { expect } from 'vitest';
import { insideCheckout, treeProblem } from './setup-rules';

/**
 * What the unit setup throws with, shared by setup.ts and the module mocks it
 * declares (a `vi.mock` factory runs apart from the file that declares it, so
 * it imports this rather than closing over setup.ts's own names).
 */

/** The test asking, as Vitest names it, or the file when no test runs. */
export const asking = (): string => {
  const { currentTestName, testPath } = expect.getState();
  return currentTestName ?? `${testPath ?? '?'} (outside a test)`;
};

/** Throws when `root` is the checkout or a directory in it (#530). */
export const refuseWholeTree = (reader: string, root: string): void => {
  if (insideCheckout(resolve(root), process.cwd()))
    throw new Error(treeProblem(asking(), reader));
};

// `isIgnored` reads git's own record of the tree to answer one path, which
// #530 allows: the setup lets the git directory be read while one runs.
let lookups = 0;

/** Runs `read` as an ignore lookup, whose reads of the git directory are allowed. */
export const asIgnoreLookup = <T>(read: () => T): T => {
  lookups += 1;
  try {
    return read();
  } finally {
    lookups -= 1;
  }
};

export const inIgnoreLookup = (): boolean => lookups > 0;
