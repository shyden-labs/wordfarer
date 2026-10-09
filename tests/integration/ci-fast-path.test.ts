import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { runOf } from '../unit/workflow-steps';

/**
 * build-and-test's default-branch step (#460 AC2), its shell run as Actions
 * runs it: bash with -e. Moved out of the unit suite by #490, since a unit
 * test starts no process; its condition and environment are read in
 * tests/unit/ci-fast-path.test.ts.
 */

const NAME = 'The default branch is develop';

const steps =
  (
    parse(readFileSync('.github/workflows/ci.yml', 'utf8')) as {
      jobs: Record<string, { steps?: { name?: string; run?: unknown }[] }>;
    }
  ).jobs['build-and-test']?.steps ?? [];

const run = (branch: string) => {
  const found = steps.filter((step) => step.name === NAME);
  if (found.length !== 1)
    throw new Error(`${String(found.length)} steps are named "${NAME}"`);
  const script = runOf(found[0] ?? {});
  try {
    const stdout = execFileSync('bash', ['-e', '-c', script], {
      encoding: 'utf8',
      env: { PATH: process.env.PATH, DEFAULT_BRANCH: branch },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { status: 0, stdout };
  } catch (error) {
    const failed = error as { status: number; stdout: string };
    return { status: failed.status, stdout: failed.stdout };
  }
};

describe('the default-branch step, run (#460 AC2)', () => {
  it('passes when the default branch is develop', () => {
    expect(run('develop')).toEqual({ status: 0, stdout: '' });
  });

  for (const branch of ['main', '', 'Develop', 'develop ', 'feature/develop'])
    it(`fails, naming the setting, when the default branch is ${JSON.stringify(branch)}`, () => {
      expect(run(branch)).toEqual({
        status: 1,
        stdout:
          `::error::The default branch is '${branch}', not develop, so ` +
          'Dependabot security fixes and its config live outside the develop ' +
          'gate (#460). Set it in Settings > General > Default branch.\n',
      });
    });
});
