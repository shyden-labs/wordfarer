import ts from 'typescript';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { scopeKey, walkDisagreements } from './burn-down';
import { comparisonsWritten, literalArgumentsWritten } from './comparison-text';
import {
  RECORDED_FROM,
  literalFloorFindings,
  literalMinimumsIn,
  type FiledMinimum,
  type Minimum,
  type MinimumReading,
} from './literal-floors';
import { LITERAL_MINIMUMS } from './literal-floors.burn-down';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { codeWithoutLiterals } from './source-text';
import { committableFiles } from './tracked-files';

/**
 * The reader behind the literal-floors meta-guard (#378), and the text
 * counts that cross-check it. Each test compares a whole reading, so these
 * tests hold no bare absence assertion and no minimum of their own.
 */
const parse = (source: string, file = 'fixture.test.ts') =>
  ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
const read = (source: string): MinimumReading =>
  literalMinimumsIn(parse(source));

/** A reading of `comparisons` comparisons and the minimums given. */
const reading = (
  minimums: Minimum[],
  comparisons = minimums.length,
  literalArguments = 0,
): MinimumReading => ({ comparisons, literalArguments, minimums, refused: [] });

const at = (
  demands: number,
  form: Minimum['form'],
  line = 2,
  label = 't',
  scope: Minimum['scope'] = 'test',
): Minimum => ({ line, form, demands, scope, label });

/** The 1-based line of the first `expect(` in `source`. */
const lineOfExpect = (source: string): number =>
  source.split('\n').findIndex((line) => line.includes('expect(')) + 1;

/** `body` as the whole body of a test titled `t`, from line 2. */
const inTest = (body: string, prelude = '') =>
  `${prelude}it('t', () => {\n${body}\n});`;

describe('literalMinimumsIn: a literal bound', () => {
  it.each([
    ['toBeGreaterThan', 'expect(n).toBeGreaterThan(391);', 392],
    ['toBeGreaterThanOrEqual', 'expect(n).toBeGreaterThanOrEqual(15);', 15],
    ['numeric separators', 'expect(n).toBeGreaterThan(19_445);', 19_446],
    ['expect.soft', 'expect.soft(n).toBeGreaterThan(5);', 6],
    ['a message argument', "expect(n, 'why').toBeGreaterThan(5);", 6],
    ['the bound on its own line', 'expect(n).toBeGreaterThan(\n  5,\n);', 6],
    ['a parenthesised bound', 'expect(n).toBeGreaterThan((5));', 6],
    ['a negative bound', 'expect(n).toBeGreaterThan(-1);', 0],
    ['a bigint bound', 'expect(n).toBeGreaterThan(2n);', 3],
    ['a fraction, strictly', 'expect(n).toBeGreaterThan(0.999);', 1],
    ['a fraction, inclusive', 'expect(n).toBeGreaterThanOrEqual(1.5);', 2],
  ])('reads %s', (_name, body, demands) => {
    expect(read(inTest(body))).toEqual(reading([at(demands, 'literal')], 1, 1));
  });

  it.each([
    ['toBeLessThan on a literal subject', 'expect(5).toBeLessThan(n);', 6],
    [
      'toBeLessThanOrEqual on a literal subject',
      'expect(5).toBeLessThanOrEqual(n);',
      5,
    ],
    [
      'not.toBeGreaterThan on a literal subject',
      'expect(5).not.toBeGreaterThan(n);',
      5,
    ],
    [
      'not.toBeGreaterThanOrEqual on a literal subject',
      'expect(5).not.toBeGreaterThanOrEqual(n);',
      6,
    ],
  ])('reads %s as a minimum on the argument', (_name, body, demands) => {
    expect(read(inTest(body))).toEqual(reading([at(demands, 'literal')], 1, 0));
  });

  it.each([
    ['not.toBeLessThan', 'expect(n).not.toBeLessThan(5);', 5],
    ['not.toBeLessThanOrEqual', 'expect(n).not.toBeLessThanOrEqual(5);', 6],
  ])('reads %s on a literal bound as a minimum', (_name, body, demands) => {
    expect(read(inTest(body))).toEqual(reading([at(demands, 'literal')], 1, 1));
  });

  it.each([
    ['toBeLessThan', 'expect(n).toBeLessThan(5);'],
    ['toBeLessThanOrEqual', 'expect(n).toBeLessThanOrEqual(5);'],
    ['not.toBeGreaterThan', 'expect(n).not.toBeGreaterThan(5);'],
    ['not.toBeGreaterThanOrEqual', 'expect(n).not.toBeGreaterThanOrEqual(5);'],
  ])('reads %s on a literal bound as a maximum, no minimum', (_name, body) => {
    expect(read(inTest(body))).toEqual(reading([], 1, 1));
  });
});

describe('literalMinimumsIn: a figure written another way', () => {
  it.each([
    [
      'arithmetic of literals',
      '',
      'expect(n).toBeGreaterThan(64 * 4);',
      257,
      'arithmetic',
    ],
    [
      'a const of the file',
      'const MIN = 59;\n',
      'expect(n).toBeGreaterThanOrEqual(MIN);',
      59,
      'named',
    ],
    [
      'a const in the test',
      '',
      'const MIN = 59;\nexpect(n).toBeGreaterThanOrEqual(MIN);',
      59,
      'named',
    ],
    [
      'a const of a const',
      'const A = 58;\nconst MIN = A + 1;\n',
      'expect(n).toBeGreaterThanOrEqual(MIN);',
      59,
      'named',
    ],
    [
      'a table looked up',
      'const T = { a: 0, b: 55 } as const;\n',
      'expect(n).toBeGreaterThan(T[k] - 1);',
      55,
      'table',
    ],
    [
      'a table looked up by a written key',
      'const T = { a: 3, b: 55 };\n',
      "expect(n).toBeGreaterThan(T['a']);",
      4,
      'table',
    ],
    [
      'a field of a table looked up',
      'const F = { x: { accepted: 10, refused: 3 } };\n',
      'expect(n).toBeGreaterThan(F[k].accepted);',
      11,
      'table',
    ],
    [
      'a table looked up with a fallback',
      'const M = { core: 9 };\n',
      'expect(n).toBeGreaterThan((M[k] ?? Infinity) - 1);',
      9,
      'table',
    ],
  ])('reads %s', (_name, prelude, body, demands, form) => {
    const source = inTest(body, prelude);
    expect(read(source)).toEqual(
      reading(
        [at(demands, form as Minimum['form'], lineOfExpect(source))],
        1,
        0,
      ),
    );
  });

  it.each([
    [
      'an entries table',
      "const F = { a: 4, b: 9 };\nit.each(Object.entries(F))('t', (_k, floor) => {\n  expect(n).toBeGreaterThan(floor);\n});",
      10,
    ],
    [
      'a values table',
      "const F = { a: 4, b: 9 };\nit.each(Object.values(F))('t', (floor) => {\n  expect(n).toBeGreaterThan(floor);\n});",
      10,
    ],
    [
      'rows of a written table',
      "it.each([\n  ['a', 5],\n  ['b', 7],\n])('t', (_k, floor) => {\n  expect(n).toBeGreaterThanOrEqual(floor);\n});",
      7,
    ],
    [
      'a field of each row',
      "it.each([{ floor: 4 }, { floor: 2 }])('t', ({ floor }) => {\n  expect(n).toBeGreaterThanOrEqual(floor);\n});",
      4,
    ],
    [
      'a row passed whole by .for',
      "it.for([4, 8])('t', (floor) => {\n  expect(n).toBeGreaterThanOrEqual(floor);\n});",
      8,
    ],
  ])('reads a test table: %s', (_name, source, demands) => {
    expect(read(source)).toEqual(
      reading([at(demands, 'each-table', lineOfExpect(source))], 1, 0),
    );
  });

  it.each([
    ['a call', 'const before = f();\n', 'expect(n).toBeGreaterThan(before);'],
    ['a let', 'let MIN = 5;\n', 'expect(n).toBeGreaterThan(MIN);'],
    [
      'an import',
      "import { MIN } from './x';\n",
      'expect(n).toBeGreaterThan(MIN);',
    ],
    ['a length read at runtime', '', 'expect(n).toBeGreaterThan(xs.length);'],
    ['a name no file declares', '', 'expect(n).toBeGreaterThan(MIN);'],
    [
      'a const shadowed by a call',
      'const MIN = 5;\n',
      'const MIN = f();\nexpect(n).toBeGreaterThan(MIN);',
    ],
    [
      'a table holding a call',
      'const T = { a: f() };\n',
      'expect(n).toBeGreaterThan(T[k]);',
    ],
    ['a table of runtime rows', '', 'expect(n).toBeGreaterThan(rows[k]);'],
    [
      'the length of a written array',
      'const A = [1, 2, 3];\n',
      'expect(n).toBeGreaterThan(A.length);',
    ],
  ])('reads a bound from %s as derived, no minimum', (_name, prelude, body) => {
    expect(read(inTest(body, prelude))).toEqual(reading([], 1, 0));
  });

  it('reads a parameter of a function that is no test table as derived', () => {
    expect(
      read(
        'function check(min: number) {\n  expect(n).toBeGreaterThan(min);\n}',
      ),
    ).toEqual(reading([], 1, 0));
  });

  it('reads a test table built at runtime as derived', () => {
    expect(
      read(
        "it.each(cases())('t', (floor) => {\n  expect(n).toBeGreaterThan(floor);\n});",
      ),
    ).toEqual(reading([], 1, 0));
  });
});

describe('literalMinimumsIn: where a minimum sits', () => {
  it('reads a minimum in a named function by its name', () => {
    expect(
      read('export function check() {\n  expect(n).toBeGreaterThan(5);\n}'),
    ).toEqual(reading([at(6, 'literal', 2, 'check', 'function')], 1, 1));
  });

  it('reads a Playwright test by its title as written', () => {
    expect(
      read(
        'test(`a ${x} b`, async () => {\n  expect(n).toBeGreaterThan(5);\n});',
      ),
    ).toEqual(reading([at(6, 'literal', 2, 'a ${x} b')], 1, 1));
  });
});

describe('literalMinimumsIn: refusals', () => {
  it.each([
    [
      'a comparison with no bound',
      'expect(n).toBeGreaterThan();',
      'a comparison with no single bound',
    ],
    [
      'a spread bound',
      'expect(n).toBeGreaterThan(...xs);',
      'a comparison with no single bound',
    ],
    [
      'a chain from expect.poll',
      'expect.poll(f).toBeGreaterThan(5);',
      'a comparison on a chain this reader does not read',
    ],
    [
      'a chain from a value',
      'const e = expect(n);\ne.toBeGreaterThan(5);',
      'a comparison on a chain this reader does not read',
    ],
    [
      'a minimum written as a boolean',
      'expect(n > 5).toBe(true);',
      'a comparison written as a boolean: use a matcher',
    ],
  ])('refuses %s by line', (_name, body, why) => {
    const line = body.split('\n').length + 1;
    const { refused } = read(inTest(body));
    expect(refused).toEqual([`fixture.test.ts:${String(line)}: ${why}`]);
  });

  it('refuses a minimum in no test and no named function', () => {
    expect(read('expect(n).toBeGreaterThan(5);')).toEqual({
      comparisons: 1,
      literalArguments: 1,
      minimums: [],
      refused: [
        'fixture.test.ts:1: a minimum in no test and no named function',
      ],
    });
  });

  it('refuses expect imported under another name', () => {
    expect(read("import { expect as check } from 'vitest';").refused).toEqual([
      'fixture.test.ts:1: expect imported under another name, check',
    ]);
  });

  it('reads nothing a comment or a string spells', () => {
    expect(
      read(
        inTest(
          "// expect(n).toBeGreaterThan(5);\nconst s = 'expect(n).toBeGreaterThan(5)';",
        ),
      ),
    ).toEqual(reading([], 0, 0));
  });
});

describe('the text counts', () => {
  const text = (source: string) => codeWithoutLiterals(parse(source));

  it.each([
    [
      'one of each matcher',
      'expect(a).toBeGreaterThan(1); expect(a).toBeGreaterThanOrEqual(x); expect(a).toBeLessThan(1); expect(a).not.toBeLessThanOrEqual(y);',
      4,
      2,
    ],
    [
      'a bound on its own line',
      'expect(a).toBeGreaterThan(\n  19_445,\n);',
      1,
      1,
    ],
    [
      'parenthesised and signed bounds',
      'expect(a).toBeGreaterThan((5)); expect(a).toBeGreaterThan(-1); expect(a).toBeGreaterThan(2n);',
      3,
      3,
    ],
    [
      'a computed bound',
      'expect(a).toBeGreaterThan(64 * 4); expect(a).toBeGreaterThan(T[k] - 1);',
      2,
      0,
    ],
    [
      'only a comment and a string',
      "// expect(a).toBeGreaterThan(5)\nconst s = 'x.toBeGreaterThan(5)';",
      0,
      0,
    ],
  ])('counts %s', (_name, source, comparisons, literals) => {
    const code = text(source);
    expect({
      comparisons: comparisonsWritten(code),
      literals: literalArgumentsWritten(code),
    }).toEqual({ comparisons, literals });
  });
});

describe('literalFloorFindings', () => {
  const filed = (label: string, demands: number): FiledMinimum => ({
    file: 'a.test.ts',
    label,
    demands,
  });
  const FIX =
    'Record the figure instead: floorBreach(<id>, <count>), checked for ' +
    'equality and raised by npm run floors:record.';

  it('finds nothing when every scope is listed at its count', () => {
    const sites = [filed('t', 5), filed('t', 9), filed('u', 2)];
    expect(
      searched(
        literalFloorFindings(sites, { 'a.test.ts › t': 2, 'a.test.ts › u': 1 }),
        { of: sites, what: 'planted minimums' },
      ),
    ).toEqual([]);
    expect(
      floorBreach('literal-floors/fixture-listed', sites.length),
    ).toBeUndefined();
  });

  it(`names a minimum from ${String(RECORDED_FROM)}, and leaves out one or none`, () => {
    expect(
      literalFloorFindings(
        [filed('t', 0), filed('t', 1), filed('t', RECORDED_FROM)],
        {},
      ),
    ).toEqual([`a.test.ts › t: 1 unrecorded, 0 listed. ${FIX}`]);
  });

  it('names an entry the reading no longer holds', () => {
    expect(literalFloorFindings([], { 'a.test.ts › t': 1 })).toEqual([
      'a.test.ts › t: 0 unrecorded, 1 listed. Lower the entry in ' +
        'tests/unit/literal-floors.burn-down.ts: the list only shrinks.',
    ]);
  });

  it('names an entry that is not a count of at least one', () => {
    expect(literalFloorFindings([], { 'a.test.ts › t': 0 })).toEqual([
      'a.test.ts › t: listed as 0, not a count of at least 1',
    ]);
  });
});

/** Each form of a minimum, as a body and what it needs above the test. */
const PLANTED_FORMS = [
  ['a literal', '', 'expect(n).toBeGreaterThan(391);'],
  ['numeric separators', '', 'expect(n).toBeGreaterThan(19_445);'],
  ['an inclusive bound', '', 'expect(n).toBeGreaterThanOrEqual(15);'],
  ['expect.soft', '', 'expect.soft(n).toBeGreaterThan(5);'],
  ['a message argument', '', "expect(n, 'why').toBeGreaterThan(5);"],
  ['the bound on its own line', '', 'expect(n).toBeGreaterThan(\n  5,\n);'],
  ['a literal subject', '', 'expect(5).toBeLessThan(n);'],
  ['a negated maximum', '', 'expect(n).not.toBeLessThan(5);'],
  ['arithmetic', '', 'expect(n).toBeGreaterThan(64 * 4);'],
  ['a const', 'const MIN = 59;\n', 'expect(n).toBeGreaterThanOrEqual(MIN);'],
  [
    'a table',
    'const T = { a: 0, b: 55 } as const;\n',
    'expect(n).toBeGreaterThan(T[k] - 1);',
  ],
  [
    'a field of a table',
    'const F = { x: { accepted: 10 } };\n',
    'expect(n).toBeGreaterThan(F[k].accepted);',
  ],
] as const;
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
const PLANTED = [
  ...PLANTED_KINDS.flatMap(([kind, file, label, before, after]) =>
    PLANTED_FORMS.map(
      ([form, prelude, body]) =>
        [
          kind,
          form,
          file,
          label,
          `${prelude}${before}${body}${after}`,
        ] as const,
    ),
  ),
  [
    'a vitest test',
    'a test table',
    'planted.test.ts',
    't',
    "const F = { a: 4, b: 9 };\nit.each(Object.entries(F))('t', (_k, floor) => {\n  expect(n).toBeGreaterThan(floor);\n});",
  ] as const,
  [
    'a vitest test',
    'a field of each row',
    'planted.test.ts',
    't',
    "it.each([{ floor: 4 }])('t', ({ floor }) => {\n  expect(n).toBeGreaterThanOrEqual(floor);\n});",
  ] as const,
];

describe('the meta-guard sees every form planted in every kind of file', () => {
  it.each(PLANTED)('%s: %s', (_kind, _form, file, label, source) => {
    const sf = parse(source, file);
    const { minimums, comparisons } = literalMinimumsIn(sf);
    expect({
      read: comparisons,
      written: comparisonsWritten(codeWithoutLiterals(sf)),
      findings: literalFloorFindings(
        minimums.map((minimum) => ({ file, ...minimum })),
        {},
      ),
    }).toEqual({
      read: 1,
      written: 1,
      findings: [
        `${scopeKey(file, label)}: 1 unrecorded, 0 listed. Record the ` +
          'figure instead: floorBreach(<id>, <count>), checked for equality ' +
          'and raised by npm run floors:record.',
      ],
    });
  });
});

/**
 * Every TypeScript file git has, and what the reader made of each. Read once,
 * on first use inside a test: nothing reaches workspace code while the file
 * is collected.
 */
let walked:
  | {
      files: string[];
      readings: (MinimumReading & { file: string; code: string })[];
      comparisons: string[];
      minimums: FiledMinimum[];
    }
  | undefined;
const repository = () => {
  if (walked !== undefined) return walked;
  const files = committableFiles().filter((path) => /\.[cm]?ts$/.test(path));
  const readings = files.map((file) => {
    const sf = parse(readFileSync(file, 'utf8'), file);
    return { file, code: codeWithoutLiterals(sf), ...literalMinimumsIn(sf) };
  });
  walked = {
    files,
    readings,
    comparisons: readings.flatMap(({ file, comparisons }) =>
      Array.from(
        { length: comparisons },
        (_, n) => `${file} #${String(n + 1)}`,
      ),
    ),
    minimums: readings.flatMap(({ file, minimums }) =>
      minimums.map((minimum) => ({ file, ...minimum })),
    ),
  };
  return walked;
};

/** The burn-down list's size when the meta-guard landed (#378): it only shrinks. */
const CEILING_SITES = 71;
const CEILING_SCOPES = 58;

describe('every literal minimum of two or more is recorded, or listed (#378)', () => {
  it('finds every scope holding exactly the literal minimums listed', () => {
    const { readings, comparisons: COMPARISONS, minimums } = repository();
    const refused = readings.flatMap(({ refused }) => refused);
    const findings = literalFloorFindings(minimums, LITERAL_MINIMUMS);
    expect(
      searched(refused, { of: COMPARISONS, what: 'comparisons' }),
      refused.join('\n'),
    ).toEqual([]);
    expect(
      searched(findings, { of: COMPARISONS, what: 'comparisons' }),
      findings.join('\n'),
    ).toEqual([]);
    expect(
      floorBreach('literal-floors/comparisons', COMPARISONS.length),
    ).toBeUndefined();
  });

  it('only shrinks the burn-down list', () => {
    // Measured when the meta-guard landed (#378). A conversion lowers these
    // with the list; nothing raises them.
    const counts = Object.values(LITERAL_MINIMUMS);
    expect(counts.reduce((sum, n) => sum + n, 0)).toBeLessThanOrEqual(
      CEILING_SITES,
    );
    expect(counts.length).toBeLessThanOrEqual(CEILING_SCOPES);
  });
});

describe('the reader proves what it read (#378)', () => {
  it('reads as many comparisons and literal bounds in each file as its text writes, over every file git has', () => {
    const { readings, files: FILES } = repository();
    // Independent of the parse tree (control c): the matcher calls, and those
    // whose bound is a number written in place, counted in each file's code
    // with literals and comments removed, against the reader's counts for that
    // file. A bound folded through a name, a table or a test table is defined
    // by dataflow alone; a second reading of those would need the TypeScript
    // checker over a whole program, so the planted forms above stand for them.
    const misread = readings
      .filter(
        ({ code, comparisons, literalArguments }) =>
          comparisonsWritten(code) !== comparisons ||
          literalArgumentsWritten(code) !== literalArguments,
      )
      .map(
        ({ file, code, comparisons, literalArguments }) =>
          `${file}: ${String(comparisonsWritten(code))} comparisons and ` +
          `${String(literalArgumentsWritten(code))} literal bounds written, ` +
          `${String(comparisons)} and ${String(literalArguments)} read`,
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
    expect(floorBreach('literal-floors/files', FILES.length)).toBeUndefined();
  });
});
