import * as fs from 'node:fs';
import {
  createReadStream,
  mkdirSync,
  mkdtempSync,
  openSync,
  opendirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { walkTree } from './old-name';
import {
  gitDirsOf,
  gitProblem,
  insideCheckout,
  READ_LIMIT,
  readProblem,
  recursiveProblem,
  REFUSED,
  treeProblem,
  walkProblem,
  WALK_LIMIT,
} from './setup-rules';
import * as tracked from './tracked-files';
import { committableFiles, ignoredPaths, isIgnored } from './tracked-files';
import { everyFileHere } from './whole-tree-helper';

/**
 * A unit test reads no whole tree (#530): a whole-tree check belongs in the
 * guards suite (global rule, 2026-10-08). The unit setup refuses the named
 * readers on the checkout, a walk of three of its directories by any route,
 * any read of git's own record of the tree outside `isIgnored`, and a read of
 * twenty of its files; a fixture under the OS temp directory stays allowed. Each form below
 * runs under tests/unit/setup.ts itself.
 */

const own = (): string => expect.getState().currentTestName ?? '';
const CHECKOUT = resolve('.');

/** Three directories of the checkout, none of them tests/floors. */
const THREE = ['.github', '.github/workflows', 'tests'];

describe('the named whole-tree readers are refused on the checkout (#530 AC1, AC2)', () => {
  it('committableFiles, by a named import, throws naming the test', () => {
    expect(() => committableFiles()).toThrow(
      `${own()}: committableFiles reads the whole checkout`,
    );
  });

  it('ignoredPaths, by a named import, throws naming the test', () => {
    expect(() => ignoredPaths('.')).toThrow(
      `${own()}: ignoredPaths reads the whole checkout`,
    );
  });

  it('walkTree, by a named import, throws naming the test', () => {
    expect(() => walkTree()).toThrow(
      `${own()}: walkTree reads the whole checkout`,
    );
  });

  it('committableFiles, by a namespace import, throws naming the test', () => {
    expect(() => tracked.committableFiles(['*.ts'])).toThrow(
      `${own()}: committableFiles reads the whole checkout`,
    );
  });

  it('committableFiles, through a helper module, throws naming the test', () => {
    expect(() => everyFileHere()).toThrow(
      `${own()}: committableFiles reads the whole checkout`,
    );
  });

  it('a subdirectory of the checkout is the checkout too', () => {
    expect(() => committableFiles([], 'packages')).toThrow(
      `${own()}: committableFiles reads the whole checkout`,
    );
  });

  it('a fixture under the OS temp directory reaches the reader itself', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'whole-tree-'));
    // Not a repository: the reader's own lookup is what refuses it, past the
    // setup's check.
    expect(() => ignoredPaths(fixture)).toThrow(
      `ENOENT: no such file or directory, stat '${join(fixture, '.git')}'`,
    );
  });
});

describe('a walk of the checkout is refused, by any route (#530 AC1, AC2)', () => {
  it('readdirSync, by a named import, throws at the third directory', () => {
    readdirSync(THREE[0] ?? '');
    readdirSync(THREE[1] ?? '');
    expect(() => readdirSync(THREE[2] ?? '')).toThrow(
      `${own()}: lists ${String(WALK_LIMIT)} of the checkout’s directories`,
    );
  });

  it('readdirSync, by a namespace import, throws at the third directory', () => {
    fs.readdirSync(THREE[0] ?? '');
    fs.readdirSync(THREE[1] ?? '');
    expect(() => fs.readdirSync(THREE[2] ?? '')).toThrow(
      `${own()}: lists ${String(WALK_LIMIT)} of the checkout’s directories`,
    );
  });

  it('readdir with a callback throws at the third directory', () => {
    fs.readdirSync(THREE[0] ?? '');
    fs.readdirSync(THREE[1] ?? '');
    expect(() => {
      fs.readdir(THREE[2] ?? '', () => undefined);
    }).toThrow(
      `${own()}: lists ${String(WALK_LIMIT)} of the checkout’s directories`,
    );
  });

  it('fs.promises.readdir throws at the third directory', async () => {
    await fs.promises.readdir(THREE[0] ?? '');
    await fs.promises.readdir(THREE[1] ?? '');
    await expect(fs.promises.readdir(THREE[2] ?? '')).rejects.toThrow(
      `${own()}: lists ${String(WALK_LIMIT)} of the checkout’s directories`,
    );
  });

  it('opendirSync throws at the third directory', () => {
    opendirSync(THREE[0] ?? '').closeSync();
    opendirSync(THREE[1] ?? '').closeSync();
    expect(() => opendirSync(THREE[2] ?? '')).toThrow(
      `${own()}: lists ${String(WALK_LIMIT)} of the checkout’s directories`,
    );
  });

  it('a recursive listing throws at once', () => {
    expect(() => readdirSync('tests', { recursive: true })).toThrow(
      `${own()}: lists tests recursively`,
    );
  });

  it('globSync over the checkout throws at once', () => {
    expect(() => fs.globSync('**/*.ts')).toThrow(
      `${own()}: lists . recursively`,
    );
  });

  it('two directories are not a walk', () => {
    expect(readdirSync(THREE[0] ?? '').length).toBeGreaterThan(0);
    expect(readdirSync(THREE[1] ?? '').length).toBeGreaterThan(0);
  });

  it('tests/floors is not counted: floorBreach lists it', () => {
    readdirSync('tests/floors');
    readdirSync(THREE[0] ?? '');
    expect(readdirSync(THREE[1] ?? '').length).toBeGreaterThan(0);
  });

  it('a fixture under the OS temp directory may be walked', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'whole-tree-'));
    for (const dir of ['a', 'b', 'c', 'd']) mkdirSync(join(fixture, dir));
    const listed = ['a', 'b', 'c', 'd'].map(
      (dir) => readdirSync(join(fixture, dir)).length,
    );
    expect(listed).toEqual([0, 0, 0, 0]);
    expect(readdirSync(fixture, { recursive: true })).toHaveLength(4);
  });
});

describe('git’s own record of the tree is read only by isIgnored (#530)', () => {
  const GIT = (path: string): string =>
    `${own()}: reads ${path}, git’s own record of the tree`;

  it('readFileSync of .git/index, by a named import, throws naming the test', () => {
    expect(() => readFileSync('.git/index')).toThrow(GIT('.git/index'));
  });

  it('readFileSync of .git/index, by a namespace import, throws naming the test', () => {
    expect(() => fs.readFileSync('.git/index')).toThrow(GIT('.git/index'));
  });

  it('fs.promises.readFile of .git/index rejects naming the test', async () => {
    await expect(fs.promises.readFile('.git/index')).rejects.toThrow(
      GIT('.git/index'),
    );
  });

  it('readFile of .git/index with a callback throws naming the test', () => {
    expect(() => {
      fs.readFile('.git/index', () => undefined);
    }).toThrow(GIT('.git/index'));
  });

  it('openSync of .git/index throws naming the test', () => {
    expect(() => openSync('.git/index', 'r')).toThrow(GIT('.git/index'));
  });

  it('open of .git/index with a callback throws naming the test', () => {
    expect(() => {
      fs.open('.git/index', () => undefined);
    }).toThrow(GIT('.git/index'));
  });

  it('fs.promises.open of .git/index rejects naming the test', async () => {
    await expect(fs.promises.open('.git/index')).rejects.toThrow(
      GIT('.git/index'),
    );
  });

  it('createReadStream of .git/index throws naming the test', () => {
    expect(() => createReadStream('.git/index')).toThrow(GIT('.git/index'));
  });

  it('any other file in the git directory throws too', () => {
    expect(() => readFileSync('.git/HEAD')).toThrow(GIT('.git/HEAD'));
  });

  it('isIgnored still answers its one path, reading the index itself', () => {
    expect(isIgnored('node_modules/vitest/package.json')).toBe(true);
    expect(isIgnored('package.json')).toBe(false);
  });
});

describe('twenty of the checkout’s files are a whole-tree read (#530)', () => {
  /** Files of one directory, named by listing it alone: one directory, no walk. */
  const files = (): string[] =>
    readdirSync('tests/unit')
      .filter((name) => name.endsWith('.ts'))
      .map((name) => `tests/unit/${name}`);

  it('reads nineteen without refusal', () => {
    const read = files()
      .slice(0, 19)
      .map((path) => readFileSync(path, 'utf8').length);
    expect(read).toHaveLength(19);
  });

  it('throws at the twentieth, naming the test', () => {
    const names = files().slice(0, 20);
    for (const path of names.slice(0, -1)) readFileSync(path);
    expect(() => readFileSync(names.at(-1) ?? '')).toThrow(
      `${own()}: reads 20 of the checkout’s files`,
    );
  });

  it('a file read twice counts once', () => {
    const [first = ''] = files();
    const lengths = Array.from(
      { length: 25 },
      () => readFileSync(first).length,
    );
    expect(lengths).toHaveLength(25);
  });

  it('tests/floors is not counted: floorBreach reads it', () => {
    const floors = readdirSync('tests/floors').map((f) => `tests/floors/${f}`);
    for (const path of floors) readFileSync(path);
    const read = files()
      .slice(0, 19)
      .map((path) => readFileSync(path).length);
    expect(read).toHaveLength(19);
  });

  it('a require of the tree’s own files counts like any other read', () => {
    const load = createRequire(import.meta.url);
    const read = files()
      .slice(0, 19)
      .map((path) => readFileSync(path).length);
    expect(read).toHaveLength(19);
    expect(() => {
      load('../../package.json');
    }).toThrow(`${own()}: reads 20 of the checkout’s files`);
  });

  it('a fixture under the OS temp directory may be read whole', () => {
    const fixture = mkdtempSync(join(tmpdir(), 'whole-tree-'));
    const names = Array.from({ length: 25 }, (_, i) =>
      join(fixture, `f${String(i)}.txt`),
    );
    for (const path of names) writeFileSync(path, 'x');
    expect(names.map((path) => readFileSync(path, 'utf8')).join('')).toBe(
      'x'.repeat(25),
    );
  });
});

describe('the rules (#530)', () => {
  it.each([
    ['the checkout', CHECKOUT, true],
    ['a directory in it', join(CHECKOUT, 'tests'), true],
    ['a sibling whose name starts like it', `${CHECKOUT}-other`, false],
    ['the OS temp directory', tmpdir(), false],
  ])('insideCheckout: %s', (_case, path, inside) => {
    expect(insideCheckout(path, CHECKOUT)).toBe(inside);
  });

  it('treeProblem names the test, the reader and where such a test belongs', () => {
    expect(treeProblem('f > t', 'walkTree')).toBe(
      'f > t: walkTree reads the whole checkout; a test that reads the whole tree belongs in tests/guards (#530)',
    );
  });

  it('walkProblem names the test and the directories', () => {
    expect(walkProblem('f > t', ['a', 'b', 'c'])).toBe(
      'f > t: lists 3 of the checkout’s directories (a, b, c); a test that walks the tree belongs in tests/guards (#530)',
    );
  });

  /** A file system of directories and files with their text, for gitDirsOf. */
  const disk = (dirs: string[], files: Record<string, string>) => ({
    existsSync: (path: string) => dirs.includes(path) || path in files,
    statSync: (path: string) => ({ isDirectory: () => dirs.includes(path) }),
    readFileSync: (path: string) => files[path] ?? '',
  });

  it.each([
    ['a .git directory', disk(['/r/.git'], {}), ['/r/.git']],
    ['no .git at all', disk([], {}), ['/r/.git']],
    [
      'a .git file with no gitdir line',
      disk([], { '/r/.git': 'something else\n' }),
      ['/r/.git'],
    ],
    [
      'a worktree: its gitdir and the main repository’s commondir',
      disk([], {
        '/r/.git': 'gitdir: /main/.git/worktrees/r\n',
        '/main/.git/worktrees/r/commondir': '../..\n',
      }),
      ['/r/.git', '/main/.git/worktrees/r', '/main/.git'],
    ],
    [
      'a worktree without a commondir',
      disk([], { '/r/.git': 'gitdir: /main/.git/worktrees/r\n' }),
      ['/r/.git', '/main/.git/worktrees/r'],
    ],
    [
      'a gitdir relative to the .git file',
      disk([], { '/r/.git': 'gitdir: ../main/.git/worktrees/r\n' }),
      ['/r/.git', '/main/.git/worktrees/r'],
    ],
  ])('gitDirsOf: %s', (_case, fs, dirs) => {
    expect(gitDirsOf('/r/.git', fs)).toEqual(dirs);
  });

  it('gitProblem names the test and the file', () => {
    expect(gitProblem('f > t', '.git/index')).toBe(
      'f > t: reads .git/index, git’s own record of the tree; a test that reads the whole tree belongs in tests/guards (#530)',
    );
  });

  it('the read limit is twenty files, #515’s measure', () => {
    expect(READ_LIMIT).toBe(20);
  });

  it('readProblem names the test and the count', () => {
    expect(readProblem('f > t', 20)).toBe(
      'f > t: reads 20 of the checkout’s files; a test that reads the whole tree belongs in tests/guards (#530)',
    );
  });

  it('recursiveProblem names the test and the directory', () => {
    expect(recursiveProblem('f > t', 'tests')).toBe(
      'f > t: lists tests recursively; a test that walks the tree belongs in tests/guards (#530)',
    );
  });

  it('refuses the named readers and every directory-walk entry point, by name', () => {
    expect(REFUSED.slice(8)).toEqual([
      'tracked-files.committableFiles',
      'tracked-files.ignoredPaths',
      'old-name.walkTree',
      'fs.readdirSync',
      'fs.readdir',
      'fs.promises.readdir',
      'fs.opendirSync',
      'fs.opendir',
      'fs.promises.opendir',
      'fs.globSync',
      'fs.glob',
      'fs.promises.glob',
      'fs.readFileSync',
      'fs.readFile',
      'fs.promises.readFile',
      'fs.openSync',
      'fs.open',
      'fs.promises.open',
      'fs.createReadStream',
    ]);
  });
});
