import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { COPY_EN } from '../../apps/site/src/copy-en';
import { CopyLine, line, type Source } from '../../apps/site/src/copy-line';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import {
  NUMBER_WORDS,
  TIME_PHRASES,
  attestedFigure,
  attestedName,
  copyLeaves,
  figureCallCount,
  figureTokens,
  figureTokensByWord,
  lineCallCount,
  nameTokens,
  nameTokensByWord,
  readSpecDocs,
  resolves,
  sourceText,
} from './site-copy';
import { digits, words } from '../../apps/site/src/figures';
import { t } from '../../apps/site/src/copy-line';

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

/**
 * #443: the copy stays in sync with the game. A figure the game defines is
 * read from its tables; any other figure, and every name, must appear in the
 * text of a source the line cites, so a spec that moves on turns CI red.
 */
const sourced = () => {
  const docs = readSpecDocs();
  return copyLeaves(COPY_EN).lines.map(({ path, line: l }) => ({
    path,
    unbound: l.unbound,
    texts: l.sources.map((source) => sourceText(source, docs) ?? ''),
  }));
};

describe('the English copy stays in sync with the game (#443)', () => {
  it('every figure read from the game has approved words for its value', () => {
    const figures = copyLeaves(COPY_EN).figures;
    expect(
      searched(
        figures.flatMap(({ path, figure }) =>
          figure.missing === undefined ? [] : [`${path}: ${figure.missing}`],
        ),
        { of: figures, what: 'figures read from the game' },
      ),
    ).toEqual([]);
    expect(
      floorBreach('site-copy/figures-bound', figures.length),
    ).toBeUndefined();
  });

  it('the walk reads as many figures as the file binds', () => {
    expect(copyLeaves(COPY_EN).figures.length).toBe(
      figureCallCount(readFileSync(COPY_FILE, 'utf8')),
    );
  });

  it('every other figure in a line appears in one of its sources', () => {
    const figures = sourced().flatMap(({ path, unbound, texts }) =>
      figureTokens(unbound).map((token) => ({ path, token, texts })),
    );
    expect(
      searched(
        figures
          .filter(({ token, texts }) => !attestedFigure(token, texts))
          .map(({ path, token }) => `${path}: ${token}`),
        { of: figures, what: 'figures typed into the copy' },
      ),
    ).toEqual([]);
    expect(
      floorBreach('site-copy/figures-quoted', figures.length),
    ).toBeUndefined();
  });

  it('every name in a line appears in one of its sources', () => {
    const names = sourced().flatMap(({ path, unbound, texts }) =>
      nameTokens(unbound).map((token) => ({ path, token, texts })),
    );
    expect(
      searched(
        names
          .filter(({ token, texts }) => !attestedName(token, texts))
          .map(({ path, token }) => `${path}: ${token}`),
        { of: names, what: 'names in the copy' },
      ),
    ).toEqual([]);
    expect(floorBreach('site-copy/names', names.length)).toBeUndefined();
  });

  it('two readers find the same figures in every line', () => {
    const lines = copyLeaves(COPY_EN).lines.map(({ line: l }) => l.unbound);
    expect(lines.map(figureTokensByWord)).toEqual(lines.map(figureTokens));
  });

  it('two readers find the same names in every line', () => {
    const lines = copyLeaves(COPY_EN).lines.map(({ line: l }) => l.unbound);
    expect(lines.map(nameTokensByWord)).toEqual(lines.map(nameTokens));
  });
});

/** The figure words AC4 records; NUMBER_WORDS must be exactly these. */
const FORMS = [
  'one',
  'two',
  'three',
  'four',
  'five',
  'six',
  'seven',
  'eight',
  'nine',
  'ten',
  'eleven',
  'twelve',
  'thirteen',
  'fourteen',
  'fifteen',
  'sixteen',
  'seventeen',
  'eighteen',
  'nineteen',
  'twenty',
  'first',
  'second',
  'third',
  'fourth',
  'fifth',
  'sixth',
  'seventh',
  'eighth',
  'ninth',
  'tenth',
  'half',
  'halves',
  'quarter',
  'quarters',
  'thirds',
  'fifths',
  'tenths',
  'once',
  'twice',
  'both',
  'dozen',
  'hundred',
  'thousand',
];
const PHRASES = ['a day', 'a week', 'a month', 'a year'];

describe('figureTokens', () => {
  it('knows exactly the recorded figure words', () => {
    expect(Object.keys(NUMBER_WORDS).sort()).toEqual([...FORMS].sort());
  });

  it('knows exactly the recorded time phrases', () => {
    expect([...TIME_PHRASES].sort()).toEqual([...PHRASES].sort());
  });

  it.each(FORMS)('reads the word %s', (form) => {
    expect(figureTokens(`about ${form} things`)).toEqual([form]);
  });

  it.each(PHRASES)('reads the phrase %s', (phrase) => {
    expect(figureTokens(`once ${phrase} or so`)).toEqual(['once', phrase]);
  });

  it('reads digits, decimals included', () => {
    expect(figureTokens('at most 10, or Apache-2.0')).toEqual(['10', '2.0']);
  });

  it('reads a word whatever its case', () => {
    expect(figureTokens('Three currencies')).toEqual(['three']);
  });

  it('reads no figure inside another word, beside one it does read', () => {
    expect(
      figureTokens('someone often phones a daylily attendant, then two'),
    ).toEqual(['two']);
  });

  it('reads nothing where a figure was taken out, beside one it does read', () => {
    expect(figureTokens('at most · reviews, then 3')).toEqual(['3']);
  });
});

describe('figureTokensByWord, the second reader', () => {
  it('reads what figureTokens reads in a sentence with every kind', () => {
    const text = 'Twice a day, three of 10 got half of Apache-2.0 first.';
    expect(figureTokensByWord(text)).toEqual(figureTokens(text));
  });
});

describe('nameTokens', () => {
  it('reads a name after a comma, not the word that opens the line', () => {
    expect(nameTokens('Travel through Jawa, Bali and Sumatra.')).toEqual([
      'Jawa',
      'Bali',
      'Sumatra',
    ]);
  });

  it('skips the word that opens a sentence or follows a colon, beside a name', () => {
    expect(
      nameTokens('No ads. Learning stays: Never reset. Ok? Yes, Bali'),
    ).toEqual(['Bali']);
  });

  it('reads a name with marks inside it', () => {
    expect(nameTokens('Press Ctrl+D or read CC BY-NC-SA 4.0')).toEqual([
      'Ctrl+D',
      'CC',
      'BY-NC-SA',
    ]);
  });

  it('reads a name that follows a taken-out figure', () => {
    expect(nameTokens('climbs from · to Mastered')).toEqual(['Mastered']);
  });
});

describe('nameTokensByWord, the second reader', () => {
  it('reads what nameTokens reads in a sentence with every kind', () => {
    const text =
      'Go to Bali. Then Ctrl+D, CC BY-NC-SA and · Mastered: Yes now.';
    expect(nameTokensByWord(text)).toEqual(nameTokens(text));
  });
});

describe('attestedFigure', () => {
  it.each<[string, string, boolean]>([
    ['three', 'at most 3 visible', true],
    ['3', 'three currencies', true],
    ['10', 'at most 10 due items', true],
    ['10', 'at most 100 due items', false],
    ['2.0', 'Code Apache-2.0', true],
    ['a day', 'one email a day', true],
    ['a day', 'one email a week', false],
    ['four', 'five branches', false],
  ])('%s in %j is %s', (token, text, expected) => {
    expect(attestedFigure(token, [text])).toBe(expected);
  });
});

describe('attestedName', () => {
  it.each<[string, string, boolean]>([
    ['Jawa', '**Jawa**: Jakarta, Bandung', true],
    ['Bali', 'Balinese script', false],
    ['Ctrl+D', '(⌘D / Ctrl+D; on iPhone', true],
    ['Insight', 'insight', false],
  ])('%s in %j is %s', (token, text, expected) => {
    expect(attestedName(token, [text])).toBe(expected);
  });
});

describe('sourceText', () => {
  const docs = () => ({
    parent:
      '## 3. Core\nintro\n### 3.4 Review\nten\n### 3.5 Clocks\nweeks\n## 4. Next\nlater',
    site: '| W9  | Pricing | free |\n| W10 | Approach | A |',
    files: new Set<string>(),
  });
  it('reads a subsection up to the next heading of its level', () => {
    expect(sourceText('parent §3.4', docs())).toBe('### 3.4 Review\nten');
  });

  it('reads a section with its subsections, up to the next section', () => {
    expect(sourceText('parent §3', docs())).toBe(
      '## 3. Core\nintro\n### 3.4 Review\nten\n### 3.5 Clocks\nweeks',
    );
  });

  it('reads a decision as its row', () => {
    expect(sourceText('W9', docs())).toBe('| W9  | Pricing | free |');
  });

  it('reads an issue as no text, since its words are not in the repo', () => {
    expect(sourceText('#4', { ...docs(), parent: 'see #4' })).toBe('');
  });

  it('reads nothing for a source that names nothing', () => {
    expect(sourceText('parent §9', docs())).toBeUndefined();
  });
});

describe('figureCallCount', () => {
  it('counts the figure calls, not their names in a comment or a string', () => {
    expect(
      figureCallCount(
        "// digits('a')\nconst s = \"words('b')\";\nconst x = [digits('c'), duration('d'), words('e', {}), rankName('f'), rankList('g'), other('h')];",
      ),
    ).toBe(5);
  });
});

describe('a figure line in the walk', () => {
  it('collects each figure by its line path', () => {
    const figure = digits('T.n', { T: { n: 3 } });
    expect(
      copyLeaves({ a: line(t`at most ${figure} things`, 'D1') }).figures,
    ).toEqual([{ path: 'a', figure }]);
  });

  it('collects a missing figure with its message', () => {
    const figure = words('T.s', { '1': 'one' }, { T: { s: 2 } });
    expect(
      copyLeaves({ a: line(t`about ${figure} things`, 'D1') }).figures[0]
        ?.figure.missing,
    ).toContain('T.s is 2');
  });
});
