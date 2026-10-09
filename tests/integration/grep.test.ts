import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { grepLines } from '../unit/grep';
import { committableFiles } from '../unit/tracked-files';

/**
 * grepLines (#491) against git grep itself, on every file git has: the unit
 * suite greps in-process (line-of, old-name), so the real git grep runs
 * here, on every CI run.
 */

/** Strings most test files hold, so the search reads lines in many files. */
const NEEDLES = ['it(', 'describe('];

/** Each hit as `path:line:text`. */
const gitHits = (): string[] => {
  const run = spawnSync(
    'git',
    [
      'grep',
      '-n',
      '-z',
      '-I',
      '--untracked',
      '-F',
      ...NEEDLES.flatMap((needle) => ['-e', needle]),
    ],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  // 0: matches, 1: none; anything else is a failure.
  expect(run.status, run.stderr).toBe(0);
  return run.stdout
    .split('\n')
    .filter((hit) => hit !== '')
    .map((hit) => {
      const [path, line, ...text] = hit.split('\0');
      if (path === undefined || line === undefined || !/^\d+$/.test(line))
        throw new Error(`cannot read git grep's hit: ${JSON.stringify(hit)}`);
      return `${path}:${line}:${text.join('\0')}`;
    });
};

describe('grepLines against git grep (#491)', () => {
  it('finds the lines git grep -n -F finds, in every file git has', () => {
    const git = gitHits();
    const mine = committableFiles()
      .filter((path) => {
        try {
          return statSync(path).isFile();
        } catch {
          return false;
        }
      })
      .flatMap((path) => {
        const bytes = readFileSync(path);
        // -I: git grep reads no file it takes for binary.
        if (bytes.includes(0)) return [];
        return grepLines(bytes.toString('utf8'), NEEDLES).map(
          ({ line, text }) => `${path}:${String(line)}:${text}`,
        );
      });
    const listed = new Set(git);
    const found = new Set(mine);
    const diff = [
      ...mine
        .filter((hit) => !listed.has(hit))
        .map((hit) => `only grepLines finds ${hit}`),
      ...git
        .filter((hit) => !found.has(hit))
        .map((hit) => `only git grep finds ${hit}`),
    ];
    expect(
      searched(diff, { of: git, what: 'lines git grep finds' }),
      diff.slice(0, 20).join('\n'),
    ).toEqual([]);
    expect(floorBreach('grep/git-grep-lines', git.length)).toBeUndefined();
  });
});
