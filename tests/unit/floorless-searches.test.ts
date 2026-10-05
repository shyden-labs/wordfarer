import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import {
  absencesWritten,
  callOpening,
  testsWritten,
  zerosWritten,
} from './absence-text';
import { readFileSync } from 'node:fs';
import {
  burnDownFindings,
  scalarZerosIn,
  scopeKey,
  searchSitesIn,
  walkDisagreements,
  type FiledSite,
  type Form,
  type SearchReading,
  type ZeroReading,
} from './floorless-searches';
import { UNPROVED } from './floorless-searches.burn-down';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { committableFiles } from './tracked-files';
import { codeWithoutLiterals } from './source-text';

/**
 * The reader behind the floorless-searches meta-guard (#361), and the text
 * counts that cross-check it. Each test compares a whole reading, so these
 * tests hold no bare absence assertion of their own.
 */
const parse = (source: string) =>
  ts.createSourceFile('fixture.test.ts', source, ts.ScriptTarget.Latest, true);
const read = (source: string): SearchReading => searchSitesIn(parse(source));
const text = (source: string) => codeWithoutLiterals(parse(source));

const SEARCH = "expect(searched(f, { of: p, what: 'w' })).toEqual([]);";
const FLOOR = "expect(floorBreach('x/y', p.length)).toBeUndefined();";

/** A reading of one site and nothing else. */
const one = (
  site: {
    form?: Form;
    scope?: 'test' | 'function';
    label?: string;
    proved?: boolean;
    line?: number;
  },
  tests: string[] = ['t'],
): SearchReading => ({
  sites: [
    {
      line: 2,
      form: 'searched',
      scope: 'test',
      label: 't',
      proved: false,
      ...site,
    },
  ],
  tests,
  refusalChecks: 0,
  unplaced: 0,
  refused: [],
});

describe('searchSitesIn: where a search sits', () => {
  // Planted by hand, one per way this repository declares a test.
  it.each([
    ['vitest it', `it('t', () => {\n${SEARCH}\n});`],
    ['vitest it.each', `it.each([[1]])('t', (n) => {\n${SEARCH}\n});`],
    [
      'vitest it.each with type arguments holding parentheses',
      `it.each<[string, () => number]>([['a', () => 1]])('t', (a, f) => {\n${SEARCH}\n});`,
    ],
    ['vitest it with a timeout', `it('t', () => {\n${SEARCH}\n}, 60_000);`],
    [
      'vitest it with options',
      `it('t', { timeout: 1 }, () => {\n${SEARCH}\n});`,
    ],
    ['Playwright test', `test('t', async ({ page }) => {\n${SEARCH}\n});`],
    ['test.skip with a title', `test.skip('t', async () => {\n${SEARCH}\n});`],
    ['test.fixme', `test.fixme('t', async () => {\n${SEARCH}\n});`],
    ['it.only', `it.only('t', () => {\n${SEARCH}\n});`],
  ])('reads a search in %s as unproved in its test', (_what, source) => {
    expect(read(source)).toEqual(one({}));
  });

  it.each([
    [
      'a test inside a group',
      `describe('g', () => {\nit('t', () => {\n${SEARCH}\n});\n});`,
    ],
    [
      'a test inside describe.each',
      `describe.each([1])('g %s', () => {\nit('t', () => {\n${SEARCH}\n});\n});`,
    ],
    [
      "a callback inside a test's body",
      `it('t', () => {\nrows.map(() =>\n${SEARCH}\n);\n});`,
    ],
  ])('reads a search in %s as in its test', (_what, source) => {
    expect(read(source)).toEqual(one({ line: 3 }));
  });

  it.each([
    ['a function declaration', `function check() {\n${SEARCH}\n}`],
    ['an arrow held by a const', `const check = () => {\n${SEARCH}\n};`],
    [
      'a function expression held by a const',
      `const check = function () {\n${SEARCH}\n};`,
    ],
    ['a method', `const o = {\ncheck() {\n${SEARCH}\n},\n};`],
    [
      'a property holding an arrow',
      `const o = {\ncheck: () => {\n${SEARCH}\n},\n};`,
    ],
  ])('reads a search in %s by the function name', (_what, source) => {
    const line = source.split('\n').findIndex((l) => l === SEARCH) + 1;
    expect(read(source)).toEqual(
      one({ scope: 'function', label: 'check', line }, []),
    );
  });

  it('reads a named function inside a test by its name', () => {
    expect(
      read(`it('t', () => {\nconst check = () => {\n${SEARCH}\n};\n});`),
    ).toEqual(one({ scope: 'function', label: 'check', line: 3 }));
  });

  it('reads a title written as a template as written', () => {
    expect(read(`it(\`\${locale}: t\`, () => {\n${SEARCH}\n});`)).toEqual(
      one({ label: '${locale}: t' }, ['${locale}: t']),
    );
  });

  it('reads every test body, with or without a site', () => {
    expect(
      read(
        "it('a', () => {});\nit.each([1])('b %s', () => {});\ntest('c', async () => {});\ntest.describe('g', () => {});\ntest.skip(true, 'why');",
      ),
    ).toEqual({
      sites: [],
      tests: ['a', 'b %s', 'c'],
      refusalChecks: 0,
      unplaced: 0,
      refused: [],
    });
  });
});

describe('searchSitesIn: a floor on the population searched', () => {
  it.each([
    ['a floor on its length', `it('t', () => {\n${SEARCH}\n${FLOOR}\n});`],
    [
      'a floor on its size',
      "it('t', () => {\nsearched(f, { of: s, what: 'w' });\nfloorBreach('x/y', s.size);\n});",
    ],
    [
      'a floor on the count it searched',
      "it('t', () => {\nsearched(f, { of: n, what: 'w' });\nfloorBreach('x/y', n);\n});",
    ],
    [
      'a floor on a property path, spaced differently',
      "it('t', () => {\nsearched(f, { of: a.b, what: 'w' });\nfloorBreach('x/y', a .b.length);\n});",
    ],
    [
      'a floor on a population written in shorthand',
      "it('t', () => {\nsearched(f, { of, what: 'w' });\nfloorBreach('x/y', of.length);\n});",
    ],
    [
      'a floor in a callback of the same test',
      `it('t', () => {\n${SEARCH}\nrows.map(() => {\n${FLOOR}\n});\n});`,
    ],
  ])('reads a search whose test checks %s as proved', (_what, source) => {
    expect(read(source)).toEqual(one({ proved: true }));
  });

  it.each([
    [
      'a floor on another population',
      "it('t', () => {\nsearched(f, { of: files, what: 'w' });\nfloorBreach('x/y', tests.length);\n});",
    ],
    [
      'a floor on a population that only starts with the same name',
      "it('t', () => {\nsearched(f, { of: files, what: 'w' });\nfloorBreach('x/y', files.flat().length);\n});",
    ],
    [
      'a search with no of:',
      "it('t', () => {\nsearched(f, { what: 'w' });\nfloorBreach('x/y', of.length);\n});",
    ],
    [
      'a check of something other than a floor',
      "it('t', () => {\nsearched(f, { of: p, what: 'w' });\nexpect(p.length).toBe(3);\n});",
    ],
  ])('reads a search whose test checks %s as unproved', (_what, source) => {
    expect(read(source)).toEqual(one({}));
  });

  it('reads a floor in another test as no floor for this one', () => {
    expect(
      read(`it('a', () => {\n${SEARCH}\n});\nit('b', () => {\n${FLOOR}\n});`),
    ).toEqual(one({ label: 'a' }, ['a', 'b']));
  });

  it('reads a function that checks a floor as proved', () => {
    expect(read(`function check() {\n${SEARCH}\n${FLOOR}\n}`)).toEqual(
      one({ scope: 'function', label: 'check', proved: true }, []),
    );
  });
});

describe('searchSitesIn: bare absence forms', () => {
  // Each form this repository writes, and the siblings AC2 of #361 names.
  it.each<[string, Form]>([
    ['expect(xs).toEqual([]);', 'empty'],
    ['expect(xs).toStrictEqual([]);', 'empty'],
    ['expect(o).toEqual({});', 'empty'],
    ['expect(o).toStrictEqual({});', 'empty'],
    ['expect(xs).toHaveLength(0);', 'empty'],
    ['expect(xs.length).toBe(0);', 'empty'],
    ['expect(s.size).toBe(0);', 'empty'],
    ['expect(s.size).toEqual(0);', 'empty'],
    ['expect(xs, "a message").toEqual([]);', 'empty'],
    ['expect.soft(xs).toEqual([]);', 'empty'],
    ['expect(\n  xs.filter((x) => x > 1),\n).toEqual(\n  [],\n);', 'empty'],
    ['expect(xs.some((x) => x > 1)).toBe(false);', 'no-match'],
    ['expect(xs.every((x) => x > 1)).toBe(true);', 'no-match'],
    ['expect(text).not.toContain("<");', 'not-contained'],
    ['expect(xs).not.toContainEqual({ a: 1 });', 'not-contained'],
    ['expect(text).not.toMatch(/main/);', 'not-contained'],
  ])('reads %s as a bare %s site, never proved', (assertion, form) => {
    expect(read(`it('t', () => {\n${assertion}\n});`)).toEqual(one({ form }));
  });

  it.each([
    ['a presence check', 'expect(xs).not.toEqual([]);'],
    ['an equality with content', 'expect(xs).toEqual([1]);'],
    ['a scalar zero', 'expect(result.status).toBe(0);'],
    ['an undefined value', 'expect(found).toBeUndefined();'],
    ['a length of one', 'expect(xs).toHaveLength(1);'],
    ['a some that holds', 'expect(xs.some((x) => x)).toBe(true);'],
    ['an every that fails', 'expect(xs.every((x) => x)).toBe(false);'],
    ['a membership that holds', 'expect(xs).toContain(1);'],
    [
      'an empty equality on a resolved promise',
      'await expect(p).resolves.toEqual([]);',
    ],
  ])('reads %s as no site', (_what, assertion) => {
    expect(read(`it('t', () => {\n${assertion}\n});`)).toEqual({
      sites: [],
      tests: ['t'],
      refusalChecks: 0,
      unplaced: 0,
      refused: [],
    });
  });

  it.each([
    ['a search', SEARCH, 'searched'],
    [
      'a size read from a controlled search',
      'expect(againstControl(f, { input: [], control: [1] }).size).toBe(0);',
      'control',
    ],
  ])(
    'reads %s inside a bare form as one site, not two',
    (_what, assertion, form) => {
      expect(read(`it('t', () => {\n${assertion}\n});`)).toEqual(
        one({ form: form as Form, proved: form === 'control' }),
      );
    },
  );
});

describe('searchSitesIn: againstControl', () => {
  // Proved by its shape: an empty input written in place, a control, and a
  // run that reads its one argument (operator, 2026-10-05: empty input only).
  it.each([
    [
      'a function name',
      "againstControl(parseLog, { input: '', control: ONE })",
    ],
    ['a method', 'againstControl(git.parseLog, { input: ``, control: ONE })'],
    [
      'an arrow over an empty list',
      'againstControl((held) => rootFactors(c, holding(held)), { input: [], control: ONE })',
    ],
    [
      'an empty object',
      'againstControl((w) => reviewQueue(w, T0), { input: {}, control: ONE })',
    ],
    ['an empty map', 'againstControl(f, { input: new Map(), control: ONE })'],
    ['an empty set', 'againstControl(f, { input: new Set(), control: ONE })'],
  ])('reads a control over %s as proved', (_what, call) => {
    expect(read(`it('t', () => {\nexpect(${call}).toEqual([]);\n});`)).toEqual(
      one({ form: 'control', proved: true }),
    );
  });

  it.each([
    [
      'an input with content',
      "againstControl(f, { input: ['x'], control: ONE })",
    ],
    [
      'an input held in a name',
      'againstControl(f, { input: NONE, control: ONE })',
    ],
    [
      'a map with entries',
      'againstControl(f, { input: new Map(rows), control: ONE })',
    ],
    ['no control', "againstControl(f, { input: '' })"],
    [
      'a run that ignores its argument',
      "againstControl((x) => scan(files), { input: '', control: ONE })",
    ],
    [
      'a run of two arguments',
      "againstControl((a, b) => f(a, b), { input: '', control: ONE })",
    ],
    ['options held in a name', 'againstControl(f, OPTIONS)'],
  ])('reads a control over %s as unproved', (_what, call) => {
    expect(read(`it('t', () => {\nexpect(${call}).toEqual([]);\n});`)).toEqual(
      one({ form: 'control' }),
    );
  });
});

/** The scalar zeros a source holds, as the reader returns them (#367). */
const ZERO_CASES = [
  ['a scalar toBe(0)', 'expect(x).toBe(0);', ['line 1: expect(x).toBe(0)'], 1],
  [
    'a scalar toEqual(0)',
    'expect(x).toEqual(0);',
    ['line 1: expect(x).toEqual(0)'],
    1,
  ],
  [
    'a scalar toStrictEqual(0)',
    'expect(x).toStrictEqual(0);',
    ['line 1: expect(x).toStrictEqual(0)'],
    1,
  ],
  [
    'a soft scalar zero',
    'expect.soft(x).toBe(0);',
    ['line 1: expect.soft(x).toBe(0)'],
    1,
  ],
  ['a length of 0, which is a site', 'expect(x.length).toBe(0);', [], 1],
  ['a negated zero', 'expect(x).not.toBe(0);', [], 1],
  ['toHaveLength(0), which is no scalar', 'expect(x).toHaveLength(0);', [], 0],
  ['a non-zero', 'expect(x).toBe(1);', [], 0],
] as const;

describe('searchSitesIn: scalar zeros it does not read as sites (#367)', () => {
  it.each(ZERO_CASES)('%s', (_name, source, scalarZeros, zeroAssertions) => {
    expect(scalarZerosIn(parse(source))).toEqual({
      scalarZeros,
      zeroAssertions,
    });
  });

  it.each(ZERO_CASES)(
    'the text counts the zero assertions in %s',
    (_name, source, _scalarZeros, zeroAssertions) => {
      expect(zerosWritten(text(source))).toBe(zeroAssertions);
    },
  );
});

describe('searchSitesIn: refusal checks and refusals', () => {
  it.each([
    [
      'searched',
      "expect(() => searched([], { of: [], what: 'w' })).toThrow(/no w/);",
    ],
    [
      'searched, in a block',
      "expect(() => {\nsearched([], { of: [], what: 'w' });\n}).toThrow();",
    ],
    [
      'againstControl',
      "expect(() => againstControl(f, { input: ['x'], control: ONE })).toThrowError();",
    ],
  ])(
    'counts %s that only proves it throws as a refusal check, not a site',
    (_what, assertion) => {
      expect(read(`it('t', () => {\n${assertion}\n});`)).toEqual({
        sites: [],
        tests: ['t'],
        refusalChecks: 1,
        unplaced: 0,
        refused: [],
      });
    },
  );

  it.each([
    [
      'a negated throw',
      "expect(() => searched(f, { of: p, what: 'w' })).not.toThrow();",
    ],
    [
      'a block that does more',
      "expect(() => {\nsearched(f, { of: p, what: 'w' });\nother();\n}).toThrow();",
    ],
  ])('reads a search in %s as a site', (_what, assertion) => {
    const { sites, refusalChecks } = read(`it('t', () => {\n${assertion}\n});`);
    expect({ forms: sites.map(({ form }) => form), refusalChecks }).toEqual({
      forms: ['searched'],
      refusalChecks: 0,
    });
  });

  it.each([
    [
      'in a hook',
      `beforeAll(() => {\n${SEARCH}\n});`,
      'a search in no test and no named function',
      1,
    ],
    [
      'at module level',
      `const x = 1;\n${SEARCH}`,
      'a search in no test and no named function',
      1,
    ],
    [
      'in an anonymous callback outside a test',
      `rows.map(() => {\n${SEARCH}\n});`,
      'a search in no test and no named function',
      1,
    ],
    [
      'imported under another name',
      "const x = 1;\nimport { searched as s } from '../searched';",
      'searched imported under another name, s',
      0,
    ],
    [
      'with expect imported under another name',
      "const x = 1;\nimport { expect as check } from 'vitest';",
      'expect imported under another name, check',
      0,
    ],
    [
      'with againstControl imported under another name',
      "const x = 1;\nimport { againstControl as c } from '../searched';",
      'againstControl imported under another name, c',
      0,
    ],
    [
      'read as a value',
      'const x = 1;\nrows.map(searched);',
      'searched read as a value, not called',
      0,
    ],
  ])(
    'refuses a search %s by line, never skips it',
    (_what, source, why, unplaced) => {
      expect(read(source)).toEqual({
        sites: [],
        tests: [],
        refusalChecks: 0,
        unplaced,
        refused: [`fixture.test.ts:2: ${why}`],
      });
    },
  );

  it('reads nothing a comment or a string spells', () => {
    expect(
      read(
        `// it('t', () => { ${SEARCH} });\nconst s = "searched(f, { of: p })";`,
      ),
    ).toEqual({
      sites: [],
      tests: [],
      refusalChecks: 0,
      unplaced: 0,
      refused: [],
    });
  });

  it('reads the definitions and their imports as no site', () => {
    expect(
      read(
        "import { againstControl, searched } from '../searched';\nexport function searched<T>(f: T[]) { return f; }\nexport function againstControl() {}",
      ),
    ).toEqual({
      sites: [],
      tests: [],
      refusalChecks: 0,
      unplaced: 0,
      refused: [],
    });
  });
});

describe('the text counts', () => {
  it.each([
    ['a search', SEARCH, 1],
    ['a spread search', "[...searched(f, { of: p, what: 'w' })];", 1],
    [
      'a search with type arguments',
      "searched<string>(f, { of: p, what: 'w' });",
      1,
    ],
    ['a control', "againstControl(f, { input: '', control: x });", 1],
    ['a method of the same name', 'obj.searched(f);', 0],
    [
      'the definitions',
      'export function searched<T>(f: T[]) {}\nfunction againstControl() {}',
      0,
    ],
    [
      'each bare form once',
      'expect(a).toEqual([]);\nexpect(b).toStrictEqual({});\nexpect(c).toHaveLength(0);\nexpect(d.size).toBe(0);\nexpect(e.length, "m").toEqual(0);\nexpect(f.some((x) => x)).toBe(false);\nexpect(g.every((x) => x)).toBe(true);\nexpect(h).not.toContain(1);\nexpect(i).not.toContainEqual(1);\nexpect(j).not.toMatch(/x/);',
      10,
    ],
    [
      'a bare form broken over lines',
      'expect(\n  xs.length,\n).toBe(\n  0,\n);',
      1,
    ],
    [
      'presence and scalars',
      'expect(a).not.toEqual([]);\nexpect(b.status).toBe(0);\nexpect(c).toHaveLength(1);\nexpect(d.some((x) => x)).toBe(true);',
      0,
    ],
    [
      'a bare form around a wrapper',
      `${SEARCH}\nexpect(againstControl(f, { input: [], control: x }).size).toBe(0);`,
      2,
    ],
    [
      'a comment and a string spelling them',
      "// expect(a).toEqual([]); searched(f)\nconst s = 'expect(a).toEqual([])';",
      0,
    ],
  ])('counts %s as written', (_what, source, count) => {
    expect(absencesWritten(text(source))).toBe(count);
  });

  it.each([
    ['it', "it('t', () => {});", 1],
    ['it.each', "it.each([[1, 2]])('t', (a, b) => {});", 1],
    [
      'it.each with type arguments holding parentheses',
      "it.each<[string, () => Course]>([])('t', (a, f) => {});",
      1,
    ],
    [
      'a modifier',
      "it.only('t', () => {});\ntest.fixme('t', async () => {});",
      2,
    ],
    ['a timeout after the body', "it('t', () => {}, 60_000);", 1],
    ['options before the body', "it('t', { timeout: 1 }, () => {});", 1],
    [
      'an annotation',
      "test.skip(true, 'why');\ntest.slow();\ntest.skip(({ browserName }) => browserName === 'webkit', 'why');",
      0,
    ],
    [
      'suites and hooks',
      "describe('g', () => {});\ntest.describe('g', () => {});\ntest.beforeAll(() => {});",
      0,
    ],
    ['a method called it', "obj.it('t', () => {});", 0],
    ['an unknown member', "it.todoo('t', () => {});", 0],
    [
      'a comment and a string spelling one',
      "// it('x', () => {})\nconst s = \"it('y', () => {})\";",
      0,
    ],
  ])('counts %s as tests written', (_what, source, count) => {
    expect(testsWritten(text(source))).toBe(count);
  });

  it.each([
    ['a call', 'f(1)', 1, 1],
    ['type arguments', 'f<A>(1)', 1, 4],
    ['type arguments holding an arrow', 'f<[() => A]>(1)', 1, 12],
    ['no call', 'f.g', 1, -1],
    ['unbalanced type arguments', 'f<A(1)', 1, -1],
  ])('finds the parenthesis that calls %s', (_what, code, at, open) => {
    expect(callOpening(code, at)).toBe(open);
  });
});

/**
 * Planted by hand: every form, in each kind of file the walk reads (a vitest
 * test, a Playwright spec, a helper's named function), must be read as one
 * unproved site, counted as written, and turned into a finding.
 */
const PLANTED_FORMS = [
  'expect(xs).toEqual([]);',
  'expect(xs).toStrictEqual([]);',
  'expect(o).toEqual({});',
  'expect(o).toStrictEqual({});',
  'expect(xs).toHaveLength(0);',
  'expect(xs.length).toBe(0);',
  'expect(s.size).toBe(0);',
  'expect(xs.some((x) => x)).toBe(false);',
  'expect(xs.every((x) => x)).toBe(true);',
  'expect(text).not.toContain("<");',
  'expect(xs).not.toContainEqual(1);',
  'expect(text).not.toMatch(/x/);',
  "expect(searched(f, { of: p, what: 'w' })).toEqual([]);",
  'expect(againstControl(f, { input: NONE, control: ONE })).toEqual([]);',
];
const PLANTED_KINDS = [
  ['a vitest test', 'planted.test.ts', 't', "it('t', () => {\n", '\n});'],
  [
    'a Playwright spec',
    'planted.spec.ts',
    't',
    "test('t', async () => {\n",
    '\n});',
  ],
  ['a helper', 'planted.ts', 'check', 'export function check() {\n', '\n}'],
] as const;
const PLANTED = PLANTED_KINDS.flatMap(([kind, file, label, before, after]) =>
  PLANTED_FORMS.map(
    (form) => [kind, form, file, label, before, after] as const,
  ),
);

describe('the meta-guard sees every form planted in every kind of file', () => {
  it.each(PLANTED)('%s: %s', (_kind, form, file, label, before, after) => {
    const sf = ts.createSourceFile(
      file,
      `${before}${form}${after}`,
      ts.ScriptTarget.Latest,
      true,
    );
    const { sites } = searchSitesIn(sf);
    expect({
      read: sites.length,
      written: absencesWritten(codeWithoutLiterals(sf)),
      findings: burnDownFindings(
        sites.map((site) => ({ file, ...site })),
        {},
      ),
    }).toEqual({
      read: 1,
      written: 1,
      findings: [
        `${scopeKey(file, label)}: 1 unproved, 0 listed. Check a recorded ` +
          "floor on each search's population in the same test (searched + " +
          'floorBreach), or use againstControl for an input left empty on purpose.',
      ],
    });
  });
});

const at = (label: string, proved = false): FiledSite => ({
  file: 'a.test.ts',
  label,
  proved,
});

describe('burnDownFindings', () => {
  it('finds nothing when every unproved scope is listed at its count', () => {
    const sites = [at('t'), at('t'), at('u', true)];
    expect(
      searched(burnDownFindings(sites, { 'a.test.ts › t': 2 }), {
        of: sites,
        what: 'planted sites',
      }),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/fixture-listed', sites.length),
    ).toBeUndefined();
  });

  it.each([
    [
      'more unproved than listed',
      [at('t'), at('t')],
      { 'a.test.ts › t': 1 },
      '2 unproved, 1 listed. Check',
    ],
    [
      'an unproved scope not listed',
      [at('t')],
      {},
      '1 unproved, 0 listed. Check',
    ],
    [
      'fewer unproved than listed',
      [at('t')],
      { 'a.test.ts › t': 2 },
      '1 unproved, 2 listed. Lower',
    ],
    [
      'a listed scope with none left',
      [at('t', true)],
      { 'a.test.ts › t': 1 },
      '0 unproved, 1 listed. Lower',
    ],
    [
      'an entry of zero',
      [at('t', true)],
      { 'a.test.ts › t': 0 },
      'listed as 0, not a count',
    ],
    [
      'a fractional entry',
      [at('t')],
      { 'a.test.ts › t': 1.5 },
      'listed as 1.5, not a count',
    ],
  ])('finds %s', (_what, sites, listed, message) => {
    expect(burnDownFindings(sites, listed)).toEqual([
      expect.stringContaining(`a.test.ts › t: ${message}`),
    ]);
  });
});

describe('walkDisagreements', () => {
  it('names a path on either side alone', () => {
    expect(walkDisagreements(['a.ts', 'b.ts'], ['b.ts', 'c.ts'])).toEqual([
      "a.ts: walked, not in git's list",
      "c.ts: in git's list, not walked",
    ]);
  });

  it('finds nothing when both lists hold the same paths', () => {
    const walked = ['a.ts', 'b.ts'];
    expect(
      searched(walkDisagreements(walked, ['b.ts', 'a.ts']), {
        of: walked,
        what: 'planted paths',
      }),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/fixture-walk', walked.length),
    ).toBeUndefined();
  });
});

/**
 * Every TypeScript file git has, walked with a regex over its whole list,
 * and what the reader made of each. Read once, on first use inside a test:
 * nothing reaches workspace code while the file is collected.
 */
let walked:
  | {
      files: string[];
      readings: (SearchReading &
        ZeroReading & { file: string; code: string })[];
      sites: (FiledSite & { form: Form })[];
      tests: string[];
    }
  | undefined;
const repository = () => {
  if (walked !== undefined) return walked;
  const files = committableFiles().filter((path) => /\.[cm]?ts$/.test(path));
  const readings = files.map((file) => {
    const sf = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );
    return {
      file,
      code: codeWithoutLiterals(sf),
      ...searchSitesIn(sf),
      ...scalarZerosIn(sf),
    };
  });
  walked = {
    files,
    readings,
    sites: readings.flatMap(({ file, sites }) =>
      sites.map((site) => ({ file, ...site })),
    ),
    tests: readings.flatMap(({ file, tests }) =>
      tests.map((title) => scopeKey(file, title)),
    ),
  };
  return walked;
};

/** The burn-down list's size when the meta-guard landed (#361): it only shrinks. */
const CEILING_SITES = 123;
const CEILING_SCOPES = 110;

describe('every absence search is proved, or listed (#361)', () => {
  it('finds every scope holding exactly the unproved searches listed', () => {
    const { readings, sites: SITES } = repository();
    const refused = readings.flatMap(({ refused }) => refused);
    const findings = burnDownFindings(SITES, UNPROVED);
    expect(
      searched(refused, { of: SITES, what: 'absence sites' }),
      refused.join('\n'),
    ).toEqual([]);
    expect(
      searched(findings, { of: SITES, what: 'absence sites' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/sites', SITES.length),
    ).toBeUndefined();
  });

  it('only shrinks the burn-down list', () => {
    // Measured when the meta-guard landed (#361). A conversion lowers these
    // with the list; nothing raises them.
    const counts = Object.values(UNPROVED);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBeLessThanOrEqual(
      CEILING_SITES,
    );
    expect(counts.length).toBeLessThanOrEqual(CEILING_SCOPES);
  });
});

describe('the reader proves what it read (#361)', () => {
  it('reads as many absence sites in each file as its text writes, over every file git has', () => {
    const { readings, files: FILES } = repository();
    // Independent of the parse tree (control c): the constructs counted in
    // each file's code with literals and comments removed, against what the
    // reader returned for that file. The walk is checked against git's own
    // globs, a second reading of the same list.
    const misread = readings
      .filter(
        ({ code, sites, refusalChecks, unplaced }) =>
          absencesWritten(code) !== sites.length + refusalChecks + unplaced,
      )
      .map(
        ({ file, code, sites, refusalChecks, unplaced }) =>
          `${file}: ${String(absencesWritten(code))} written, ${String(sites.length + refusalChecks + unplaced)} read`,
      );
    const walk = walkDisagreements(
      FILES,
      committableFiles(['*.ts', '*.mts', '*.cts']),
    );
    expect(
      searched(misread, { of: FILES, what: 'TypeScript files' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      searched(walk, { of: FILES, what: 'TypeScript files' }),
      walk.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/files', FILES.length),
    ).toBeUndefined();
  });

  it('reads every zero assertion its text writes, and ratchets the scalar ones (#367)', () => {
    const { readings, files: FILES } = repository();
    // A scalar zero is a count the reader cannot tell from an exit status or
    // a game value without guessing from names, so it is not a site. Its
    // count is recorded instead, so a new one fails until it is read and
    // recorded, and the count is checked per file against the text.
    const misread = readings
      .filter(
        ({ code, zeroAssertions }) => zerosWritten(code) !== zeroAssertions,
      )
      .map(
        ({ file, code, zeroAssertions }) =>
          `${file}: ${String(zerosWritten(code))} written, ${String(zeroAssertions)} read`,
      );
    const ZEROS = readings.flatMap(({ file, scalarZeros }) =>
      scalarZeros.map((zero) => `${file}: ${zero}`),
    );
    expect(
      searched(misread, { of: FILES, what: 'TypeScript files' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/zero-checked-files', FILES.length),
    ).toBeUndefined();
    expect(
      floorBreach('floorless-searches/scalar-zeros', ZEROS.length),
      ZEROS.join('\n'),
    ).toBeUndefined();
  });

  it('reads as many tests in each file as its text writes', () => {
    const { readings, tests: TESTS } = repository();
    // A site's scope is the test around it, so a test form the reader cannot
    // see sends its sites elsewhere.
    const misread = readings
      .filter(({ code, tests }) => testsWritten(code) !== tests.length)
      .map(
        ({ file, code, tests }) =>
          `${file}: ${String(testsWritten(code))} written, ${String(tests.length)} read`,
      );
    expect(
      searched(misread, { of: TESTS, what: 'tests read' }),
      misread.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('floorless-searches/tests', TESTS.length),
    ).toBeUndefined();
  });
});
