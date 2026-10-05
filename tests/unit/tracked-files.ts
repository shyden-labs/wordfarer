import { execFileSync } from 'node:child_process';

/**
 * Every path git tracks, relative to the repo root. Read NUL-separated, since
 * without `-z` git quotes any path holding a non-ASCII byte and the quoted
 * spelling matches no file.
 */
export const trackedFiles = (): string[] =>
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
    .split('\0')
    .filter((path) => path !== '');

/**
 * Every path git tracks or would track at the next `git add -A`: tracked,
 * plus untracked and not ignored. A test file written before its `git add`
 * is in it, so a count over it does not move when the file is committed.
 */
export const committableFiles = (): string[] =>
  execFileSync(
    'git',
    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
    { encoding: 'utf8' },
  )
    .split('\0')
    .filter((path) => path !== '');
