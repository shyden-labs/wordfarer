import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { walkTree } from '../unit/old-name';

/**
 * walkTree (#432) on fixture repositories, moved out of the unit suite by
 * #490: a unit test starts no process, and these run git itself, once per
 * walk, against .gitignore rules. The checker's own tests are in
 * tests/unit/old-name.test.ts.
 */

/** A git that counts its own runs, first on PATH for one call (#432). */
const countingGit = (): { dir: string; runs: () => number } => {
  const real = (process.env['PATH'] ?? '')
    .split(':')
    .map((dir) => join(dir, 'git'))
    .find((path) => existsSync(path));
  if (real === undefined) throw new Error('no git on PATH');
  const dir = mkdtempSync(join(tmpdir(), 'counting-git-'));
  const log = join(dir, 'runs.log');
  writeFileSync(log, '');
  writeFileSync(
    join(dir, 'git'),
    `#!/bin/sh\necho run >> '${log}'\nexec '${real}' "$@"\n`,
  );
  chmodSync(join(dir, 'git'), 0o755);
  return {
    dir,
    runs: () =>
      readFileSync(log, 'utf8')
        .split('\n')
        .filter((line) => line !== '').length,
  };
};

/** A repository of `depth` nested directories, each with a file, and two ignored paths. */
const nestedRepository = (depth: number): string => {
  const root = mkdtempSync(join(tmpdir(), 'walk-tree-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  writeFileSync(join(root, '.gitignore'), 'ignored-dir/\n*.log\n');
  let dir = root;
  for (let level = 0; level < depth; level += 1) {
    dir = join(dir, `d${String(level)}`);
    mkdirSync(dir);
    writeFileSync(join(dir, 'kept.txt'), 'x');
  }
  mkdirSync(join(root, 'ignored-dir'));
  writeFileSync(join(root, 'ignored-dir', 'inside.txt'), 'x');
  writeFileSync(join(root, 'd0', 'noise.log'), 'x');
  return root;
};

describe('walkTree (#432)', () => {
  it('spawns git once, however many directories it walks', () => {
    const root = nestedRepository(12);
    const git = countingGit();
    const path = process.env['PATH'];
    process.env['PATH'] = `${git.dir}:${path ?? ''}`;
    try {
      walkTree(root);
    } finally {
      process.env['PATH'] = path;
      rmSync(root, { recursive: true, force: true });
    }
    const runs = git.runs();
    rmSync(git.dir, { recursive: true, force: true });
    expect(runs).toBe(1);
  });

  it('leaves out an ignored directory whole and an ignored file, and keeps the rest', () => {
    const root = nestedRepository(3);
    // Unreadable, so a walk that enters an ignored directory throws: it must
    // skip it whole, not read it and drop each file inside.
    const ignored = join(root, 'ignored-dir');
    chmodSync(ignored, 0o000);
    try {
      // The lock holds for this user (CI runs as 1001, not root): proved, not assumed.
      expect(() => readdirSync(ignored)).toThrow(/EACCES/);
      expect(walkTree(root)).toEqual([
        '.gitignore',
        'd0/d1/d2/kept.txt',
        'd0/d1/kept.txt',
        'd0/kept.txt',
      ]);
    } finally {
      chmodSync(ignored, 0o755);
      rmSync(root, { recursive: true, force: true });
    }
  });
});
