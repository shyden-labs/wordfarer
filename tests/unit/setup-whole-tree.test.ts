import * as fs from 'node:fs';
import { mkdirSync, mkdtempSync, opendirSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { walkTree } from './old-name';
import {
  insideCheckout,
  recursiveProblem,
  REFUSED,
  treeProblem,
  walkProblem,
  WALK_LIMIT,
} from './setup-rules';
import * as tracked from './tracked-files';
import { committableFiles, ignoredPaths } from './tracked-files';
import { everyFileHere } from './whole-tree-helper';

/**
 * A unit test reads no whole tree (#530): a whole-tree check belongs in the
 * guards suite (global rule, 2026-10-08). The unit setup refuses the named
 * readers on the checkout, and a walk of three of its directories by any
 * route; a fixture under the OS temp directory stays allowed. Each form below
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
    ]);
  });
});
