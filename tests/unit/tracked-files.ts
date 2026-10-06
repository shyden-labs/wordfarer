import { execFileSync } from 'node:child_process';

/**
 * Every path git tracks or would track at the next `git add -A`, relative to
 * the repo root: tracked, plus untracked and not ignored. A test file written
 * before its `git add` is in it, so a count over it does not move when the
 * file is committed.
 * `pathspecs` narrow it with git's own globs, `'*.ts'` matching at any depth;
 * `cwd` names another repository (the tests' own, #405).
 * Read NUL-separated, since without `-z` git quotes any path holding a
 * non-ASCII byte and the quoted spelling matches no file. Each path once:
 * mid-merge, `--cached` lists a conflicted path at each of its three index
 * stages, which once inflated a floors recording by two files (#405).
 *
 * The only file walk the guards use (#385): a tracked-only walk passed over a
 * new file until it was committed (#31, #356).
 */
export const committableFiles = (
  pathspecs: readonly string[] = [],
  cwd?: string,
): string[] => [
  ...new Set(
    execFileSync(
      'git',
      [
        'ls-files',
        '-z',
        '--cached',
        '--others',
        '--exclude-standard',
        '--',
        ...pathspecs,
      ],
      { encoding: 'utf8', cwd },
    )
      .split('\0')
      .filter((path) => path !== ''),
  ),
];
