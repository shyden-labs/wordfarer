import { execFileSync } from 'node:child_process';

/**
 * Every path git tracks or would track at the next `git add -A`, relative to
 * the repo root: tracked, plus untracked and not ignored. A test file written
 * before its `git add` is in it, so a count over it does not move when the
 * file is committed.
 * `pathspecs` narrow it with git's own globs, `'*.ts'` matching at any depth.
 * Read NUL-separated, since without `-z` git quotes any path holding a
 * non-ASCII byte and the quoted spelling matches no file.
 *
 * The only file walk the guards use (#385): a tracked-only walk passed over a
 * new file until it was committed (#31, #356).
 */
export const committableFiles = (pathspecs: readonly string[] = []): string[] =>
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
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter((path) => path !== '');
