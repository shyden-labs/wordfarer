import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY_EN } from '../../apps/site/src/copy-en';
import { CopyLine, line, type Source } from '../../apps/site/src/copy-line';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { copyLeaves, lineCallCount, readSpecDocs, resolves } from './site-copy';

/**
 * The website spec's copy rule (§3), as #334 AC2 asks: every line of the
 * site's English carries a source, and every source names something real.
 * A string anywhere in the copy that is not a sourced line is a claim with no
 * source; so is a line whose source names a section, decision, issue or file
 * that does not exist.
 */
const COPY_FILE = 'apps/site/src/copy-en.ts';

describe('the English copy cites its sources (#334)', () => {
  it('every text in the copy is a sourced, non-blank line', () => {
    const { leaves, loose } = copyLeaves(COPY_EN);
    expect(searched(loose, { of: leaves, what: 'copy texts' })).toEqual([]);
    expect(floorBreach('site-copy/leaves', leaves.length)).toBeUndefined();
  });

  it('every source names a real section, decision, issue or file', () => {
    const docs = readSpecDocs();
    const sources = copyLeaves(COPY_EN).lines.flatMap(({ path, line: l }) =>
      l.sources.length === 0
        ? [{ path, source: '(none)' as Source }]
        : l.sources.map((source) => ({ path, source })),
    );
    expect(
      searched(
        sources.filter(({ source }) => !resolves(source, docs)),
        { of: sources, what: 'copy sources' },
      ),
    ).toEqual([]);
    expect(floorBreach('site-copy/sources', sources.length)).toBeUndefined();
  });

  it('the walk reads as many lines as the file writes line( calls', () => {
    expect(copyLeaves(COPY_EN).lines.length).toBe(
      lineCallCount(readFileSync(COPY_FILE, 'utf8')),
    );
  });
});

describe('copyLeaves', () => {
  it('names a bare string by its path', () => {
    expect(copyLeaves({ a: { b: 'claim' } }).loose).toEqual(['a.b']);
  });

  it('names a string inside an array by its index', () => {
    expect(copyLeaves({ a: [line('x', 'D1'), 'claim'] }).loose).toEqual([
      'a.1',
    ]);
  });

  it('names a line with blank text', () => {
    expect(copyLeaves({ a: line(' ', 'D1') }).loose).toEqual(['a']);
  });

  it('collects a sourced line by its path', () => {
    const l = line('x', 'D1');
    expect(copyLeaves({ a: [l] }).lines).toEqual([{ path: 'a.0', line: l }]);
  });

  it('refuses a value it cannot classify, by path', () => {
    expect(() => copyLeaves({ a: { b: 7 } })).toThrow(
      'a.b: a number is not copy',
    );
  });

  it('reads a line made without the helper, with no sources', () => {
    const l = new CopyLine('x', []);
    expect(copyLeaves({ a: l }).lines).toEqual([{ path: 'a', line: l }]);
  });
});

describe('resolves', () => {
  it.each<[Source, boolean]>([
    ['parent §3', true],
    ['parent §3.4', true],
    ['parent §3.9', false],
    ['parent §99', false],
    ['site §6.1', true],
    ['site §14', false],
    ['D2', true],
    ['D19', false],
    ['W9', true],
    ['W17', false],
    ['DN14', true],
    ['DN27', false],
    ['#328', true],
    ['#9999', false],
    ['file:TRADEMARKS.md', true],
    ['file:NOT-A-FILE.md', false],
    ['parent 3.4' as Source, false],
  ])('%s resolves: %s', (source, expected) => {
    expect(resolves(source, readSpecDocs())).toBe(expected);
  });
});

describe('resolves, at its edges', () => {
  const docs = (parent: string, site = '') => ({
    parent,
    site,
    files: new Set<string>(),
  });
  it.each<[string, Source, string, boolean]>([
    [
      'a heading that only starts with it',
      'parent §1',
      '## 10. Fair play',
      false,
    ],
    ['the heading itself', 'parent §1', '## 1. Intent', true],
    ['a row of a longer key', 'D2', '| D20 | x |', false],
    [
      'a do-not row outside §9',
      'DN27',
      '## 2. T\n| 27 | x |\n## 9. P\n| 26 | y |',
      false,
    ],
    [
      'a do-not row inside §9',
      'DN26',
      '## 2. T\n| 27 | x |\n## 9. P\n| 26 | y |',
      true,
    ],
    ['a longer issue number', '#32', 'see #328', false],
    ['an issue in a code span', '#32', 'see `#32`', false],
  ])('%s: %s over %j is %s', (_case, source, parent, expected) => {
    expect(resolves(source, docs(parent))).toBe(expected);
  });
});

describe('lineCallCount', () => {
  it('counts line( calls, not the word in a comment or a string', () => {
    expect(
      lineCallCount(
        "// line('a', 'D1')\nconst s = \"line('b', 'D1')\";\nconst x = [line('c', 'D1'), line('d', 'W1')];",
      ),
    ).toBe(2);
  });
});
