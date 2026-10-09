import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { committableFiles } from '../unit/tracked-files';

/**
 * Every script with an `import.meta.main` entry loads under Node's own
 * TypeScript loader, the way the workflows and npm scripts run it (#391).
 *
 * Vitest resolves `from './ensure-d1'` without its extension; Node does not.
 * #391's deploy step failed with ERR_MODULE_NOT_FOUND while every unit test
 * of that script passed, because no test had loaded it the way CI runs it.
 * Importing a script runs its top level but not its main, so only scripts
 * that guard their main with `import.meta.main` can be loaded here safely.
 */
const ROOT = new URL('../..', import.meta.url).pathname;

const isScript = (path: string) => /^scripts\/[^/]+\.ts$/.test(path);
const hasMain = (path: string) =>
  readFileSync(join(ROOT, path), 'utf8').includes('import.meta.main');

/**
 * Written out so each script gets its own test without running workspace code
 * at collection (tests/guards/collection-calls.test.ts). The first test derives
 * the population from git twice and fails on any difference, either way.
 */
const SCRIPTS = [
  'scripts/board-progress.ts',
  'scripts/ci-scope.ts',
  'scripts/ci-scripts.ts',
  'scripts/d1-binding.ts',
  'scripts/dev-secrets.ts',
  'scripts/ensure-d1.ts',
  'scripts/every-commit.ts',
  'scripts/record-floors.ts',
  'scripts/third-party-notices.ts',
  'scripts/token-reach.ts',
  'scripts/verify-dev.ts',
] as const;

describe('the scripts load under Node’s own loader (#391)', () => {
  it('lists every script with a main, as git has them, at the recorded floor', () => {
    const derived = committableFiles().filter(isScript).filter(hasMain);
    const grep = spawnSync(
      'git',
      [
        'grep',
        '--untracked',
        '-l',
        '--fixed-strings',
        'import.meta.main',
        '--',
        'scripts/*.ts',
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    expect(grep.status).toBe(0);
    const grepped = grep.stdout.split('\n').filter((line) => line !== '');
    expect(derived).toEqual(grepped.filter(isScript));
    expect(SCRIPTS).toEqual(derived);
    expect(floorBreach('script-loads/scripts', derived.length)).toBeUndefined();
  });

  for (const script of SCRIPTS)
    it(`${script} loads without running its main`, () => {
      const url = new URL(script, `file://${ROOT}`).href;
      const run = spawnSync(
        process.execPath,
        [
          '--input-type=module',
          '--eval',
          `await import(${JSON.stringify(url)});`,
        ],
        { cwd: ROOT, encoding: 'utf8' },
      );
      expect(run.stderr).toBe('');
      expect(run.status).toBe(0);
    });
});
