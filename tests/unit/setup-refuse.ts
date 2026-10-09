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
