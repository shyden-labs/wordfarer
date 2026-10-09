import { spawnSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  SUITES,
  runRefusal,
  suiteFiles,
  type Suite,
} from '../../scripts/record-floors';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { committableFiles } from '../unit/tracked-files';

/**
 * The floor recorder's suites, each listing its own files (#361), moved out
 * of the unit suite by #490: a unit test starts no process, and this one runs
 * every suite's own `vitest list` and `playwright --list`. Its raised limit
 * went with it: this suite's one limit is its CI step's. The recorder's own
 * tests are in tests/unit/record-floors.test.ts.
 */

/** A suite's files as it lists them; a list that fails is thrown, by name. */
const listedBy = (each: Suite): string[] => {
  const [command, ...args] = each.list as [string, ...string[]];
  const listed = spawnSync(command, args, { cwd: each.cwd, encoding: 'utf8' });
  const refusal = runRefusal(`${each.name}'s file list`, listed);
  if (refusal !== undefined) throw new Error(refusal);
  return suiteFiles(each, listed.stdout);
};

describe('the recorder over this repository: every suite lists its own files', () => {
  it('finds every test file git has in exactly one suite it knows', () => {
    // Each suite lists its own files, so a suite added to package.json and
    // not here, or a config whose include moved, shows as a file in none.
    const membership = new Map(
      SUITES.map((each) => [each.name, listedBy(each)] as const),
    );
    const testFiles = committableFiles().filter((file) =>
      /\.(test|spec)\.ts$/.test(file),
    );
    const homeless = testFiles
      .map((file) => ({
        file,
        suites: SUITES.filter(({ name }) =>
          (membership.get(name) ?? []).includes(file),
        ).map(({ name }) => name),
      }))
      .filter(({ suites }) => suites.length !== 1);
    expect(
      searched(homeless, { of: testFiles, what: 'test files git has' }),
    ).toEqual([]);
    expect(
      floorBreach('record-floors/test-files', testFiles.length),
    ).toBeUndefined();
  });
});
