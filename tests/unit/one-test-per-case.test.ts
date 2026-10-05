import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { scanTests, type LoopedCase, type TestScan } from './one-test-per-case';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { minus } from './burn-down';
import { committableFiles } from './tracked-files';

/**
 * One test per case (operator, 2026-10-02; Refs #58).
 *
 * A population known before the run (inputs, fixtures, methods, functions,
 * engines) is covered by generating one test per case, never by looping it
 * inside one test body. A loop inside shares one time budget across every
 * case, stops at the first failing case and hides the rest, and its title
 * names no case.
 *
 * The question asked is STRUCTURAL: does a loop inside a test assert, or
 * change page state, on each pass? Whether its population was "known before
 * the run" is a dataflow question no detector answers well. Two loops are
 * allowed inside a test, each declared in a line comment directly above it
 * with its reason: `// runtime population: <why>` for a loop over what the
 * code under test produced, and `// one scenario: <why>` for a loop whose
 * passes carry state into the next. Comments are found by position, so the
 * same words in a string do not count.
 */
const read = (source: string): TestScan => scanTests(source, 'fixture.test.ts');
const found = (source: string): readonly LoopedCase[] => read(source).looped;

/** A fixture whose loop sits on line 3, inside a test titled `t`. */
const inTest = (loop: string): string => `
it('t', () => {
  ${loop}
});`;

describe('the detector', () => {
  it('reports a loop inside a test that asserts on each pass, with its title, header and line', () => {
    expect(
      found(`
it('every case', () => {
  for (const c of CASES) {
    expect(f(c)).toBe(1);
  }
});`),
    ).toEqual([
      { test: 'every case', loop: 'for (const c of CASES)', line: 3 },
    ]);
  });

  const LOOP_KINDS: readonly (readonly [string, string])[] = [
    ['for (const c of CASES)', 'for (const c of CASES) expect(c).toBe(1);'],
    ['for (const k in TABLE)', 'for (const k in TABLE) expect(k).toBe(1);'],
    [
      'for (let i = 0; i < 3; i++)',
      'for (let i = 0; i < 3; i++) expect(i).toBe(1);',
    ],
    ['while (i < 3)', 'while (i < 3) expect(i++).toBe(1);'],
    ['do … while (i < 3)', 'do expect(i++).toBe(1); while (i < 3);'],
    ['CASES.forEach(…)', 'CASES.forEach((c) => expect(c).toBe(1));'],
    ['CASES.map(…)', 'CASES.map((c) => expect(c).toBe(1));'],
    ['CASES.every(…)', 'CASES.every(function (c) { expect(c).toBe(1); });'],
    ['CASES.some(…)', 'CASES.some((c) => { expect(c).toBe(1); });'],
  ];
  for (const [header, loop] of LOOP_KINDS)
    it(`reports the loop form ${header}`, () => {
      expect(found(inTest(loop))).toEqual([
        { test: 't', loop: header, line: 3 },
      ]);
    });

  const PER_PASS_CALLS: readonly string[] = [
    'expect(c).toBe(1)',
    'expect.soft(c).toBe(1)',
    'expect(c).not.toBe(1)',
    'await expect(page).toHaveTitle(c)',
    'await page.goto(c)',
    'await page.setViewportSize(c)',
    'await page.emulateMedia(c)',
    'await page.reload()',
    'await page.setContent(c)',
    'await browser.newPage()',
    'await browser.newContext()',
  ];
  for (const call of PER_PASS_CALLS)
    it(`reports a loop that calls ${call} on each pass`, () => {
      expect(
        found(`
test('t', async ({ page, browser }) => {
  for (const c of CASES) {
    ${call};
  }
});`),
      ).toEqual([{ test: 't', loop: 'for (const c of CASES)', line: 3 }]);
    });

  const TEST_CALLS: readonly string[] = [
    'it',
    'test',
    'it.only',
    'it.skip',
    'it.fails',
    'it.concurrent',
    'test.only',
    'test.skip',
    'test.fixme',
    'test.fail',
    'test.slow',
    'it.for(XS)',
    'it.each(XS)',
    'test.each(XS)',
  ];
  for (const call of TEST_CALLS)
    it(`looks inside ${call}(…)`, () => {
      expect(
        found(`
${call}('t', () => {
  for (const c of CASES) expect(c).toBe(1);
});`),
      ).toEqual([{ test: 't', loop: 'for (const c of CASES)', line: 3 }]);
    });

  const SIGNATURES: readonly (readonly [string, string, string])[] = [
    ['options before the body', "it('t', { timeout: 60_000 }, () => {", '});'],
    ['a timeout after the body', "it('t', () => {", '}, 60_000);'],
    ['options after the body', "it('t', () => {", '}, { timeout: 60_000 });'],
  ];
  for (const [what, open, close] of SIGNATURES)
    it(`finds the body of a test given ${what}`, () => {
      expect(
        found(`
${open}
  for (const c of CASES) expect(c).toBe(1);
${close}`),
      ).toEqual([{ test: 't', loop: 'for (const c of CASES)', line: 3 }]);
    });

  const ALLOWED: readonly (readonly [string, string, number])[] = [
    [
      'a loop that generates one test per case',
      'for (const c of CASES) it(`${c}`, () => expect(c).toBe(1));',
      1,
    ],
    [
      'a loop with no assertion or page change in it',
      `it('t', () => {
  const out = [];
  for (const c of CASES) out.push(c);
  expect(out).toEqual(CASES);
});`,
      1,
    ],
    [
      'a loop in a describe body',
      `describe('d', () => {
  for (const c of CASES) expect(c).toBe(1);
});`,
      0,
    ],
    [
      'a loop in test.describe',
      `test.describe('d', () => {
  for (const c of CASES) expect(c).toBe(1);
});`,
      0,
    ],
    [
      'a loop in a hook',
      `beforeEach(() => {
  for (const c of CASES) expect(c).toBe(1);
});`,
      0,
    ],
    [
      'a runtime population, declared above the loop',
      inTest(`// runtime population: the rows f() returned
  for (const r of f()) expect(r).toBe(1);`),
      1,
    ],
    [
      'one scenario, declared above the loop',
      inTest(`// one scenario: each answer moves the state the next one reads
  for (const a of ANSWERS) expect((s = answer(s, a))).toBeDefined();`),
      1,
    ],
    [
      'a runtime population, declared above the statement holding the loop',
      inTest(`// runtime population: the rows f() returned
  await Promise.all(f().map(async (r) => expect(r).toBe(1)));`),
      1,
    ],
  ];
  for (const [what, source, tests] of ALLOWED)
    it(`leaves alone ${what}`, () => {
      expect(read(source).tests, 'the tests the fixture holds were read').toBe(
        tests,
      );
      expect(found(source)).toEqual([]);
    });

  const NOT_A_MARKER: readonly (readonly [string, string])[] = [
    ['a marker with no reason', '// runtime population:'],
    ['a marker with a blank reason', '// one scenario:   '],
    ['a marker in a block comment', '/* runtime population: the rows */'],
    ['another word', '// runtime: the rows'],
    ['the words in a string', "const note = '// runtime population: rows';"],
  ];
  for (const [what, above] of NOT_A_MARKER)
    it(`still reports a loop under ${what}`, () => {
      expect(
        found(`
it('t', () => {
  ${above}
  for (const r of f()) expect(r).toBe(1);
});`),
      ).toEqual([{ test: 't', loop: 'for (const r of f())', line: 4 }]);
    });

  it('still reports a loop whose marker sits above an earlier statement', () => {
    expect(
      found(`
it('t', () => {
  // runtime population: the rows f() returned
  const rows = f();
  for (const r of rows) expect(r).toBe(1);
});`),
    ).toEqual([{ test: 't', loop: 'for (const r of rows)', line: 5 }]);
  });

  it('still reports a loop in a one-line test whose marker sits above the test itself', () => {
    expect(
      found(`
// runtime population: the rows f() returned
it('t', () => f().forEach((r) => expect(r).toBe(1)));`),
    ).toEqual([{ test: 't', loop: 'f().forEach(…)', line: 3 }]);
  });

  it('reports both loops of a nested pair, outer first', () => {
    expect(
      found(`
it('t', () => {
  for (const a of AS) {
    for (const b of BS) {
      expect(a + b).toBe(1);
    }
  }
});`),
    ).toEqual([
      { test: 't', loop: 'for (const a of AS)', line: 3 },
      { test: 't', loop: 'for (const b of BS)', line: 4 },
    ]);
  });

  it('judges each loop by its own marker: a marked outer loop leaves its inner loop reported', () => {
    expect(
      found(`
it('t', () => {
  // runtime population: the groups f() returned
  for (const group of f()) {
    for (const b of BS) expect(group[b]).toBe(1);
  }
});`),
    ).toEqual([{ test: 't', loop: 'for (const b of BS)', line: 5 }]);
  });

  it('names a template title by its source, so a burn-down entry is stable', () => {
    expect(
      found(`
for (const name of NAMES)
  it(\`\${name} at its edges\`, () => {
    for (const x of EDGES) expect(x).toBe(1);
  });`),
    ).toEqual([
      { test: '${name} at its edges', loop: 'for (const x of EDGES)', line: 4 },
    ]);
  });
});

describe('what the detector read (Refs #82)', () => {
  it('counts every test call it read: bare, modified, table, nested in a describe', () => {
    expect(
      read(`
it('a', () => {});
test.skip('b', () => {});
it.each(XS)('c %s', (x) => {});
test.describe('d', () => {
  test('e', async () => {});
});
test.beforeAll(() => {});
describe('f', () => {});`).tests,
    ).toBe(4);
  });

  it('reads a test body written as a function expression, and judges it', () => {
    const scan = read(`
it('t', function () {
  for (const c of CASES) expect(c).toBe(1);
});`);
    expect(scan.tests).toBe(1);
    expect(scan.looped.map((c) => c.loop)).toEqual(['for (const c of CASES)']);
  });

  it('reads a chained modifier and its table form as one test, and judges its body', () => {
    const scan = read(`
it.skip.each(XS)('t %s', () => {
  for (const c of CASES) expect(c).toBe(1);
});`);
    expect(scan.tests).toBe(1);
    expect(scan.testCalls).toEqual(["line 2: it.skip.each(XS)('t %s')"]);
    expect(scan.looped.map((c) => c.loop)).toEqual(['for (const c of CASES)']);
  });

  it('reads a describe modifier as no test and refuses nothing', () => {
    const scan = read(`test.describe.parallel('d', () => {});
test.describe.configure({ mode: 'serial' });`);
    expect(
      searched(scan.testCalls, { of: scan.examined, what: 'calls on test' }),
    ).toEqual([]);
    expect(
      floorBreach('one-test-per-case/describe-modifier-calls', scan.examined),
    ).toBeUndefined();
    expect(scan.unclassified).toEqual([]);
  });

  it('reads a Playwright annotation inside a test as no test', () => {
    const scan = read(`
test('t', async ({ isMobile }) => {
  test.skip(isMobile, 'no hover on touch');
  test.slow();
  test.fixme(({ browserName }) => browserName === 'webkit', 'no WebGL');
});`);
    expect(scan.tests).toBe(1);
    expect(scan.unclassified).toEqual([]);
  });

  it('refuses a test whose body it cannot see, by line and title', () => {
    expect(
      read(`const body = () => {};
it('named', body);`).unclassified,
    ).toEqual(["line 2: it('named') has no inline body to read"]);
  });

  it('refuses a member of it or test it does not know, by line and name', () => {
    expect(
      read(`
it.todoo('x', () => {});
test.skip.sometimes('y', () => {});`).unclassified,
    ).toEqual([
      'line 2: it.todoo is neither a test form nor a known non-test',
      'line 3: test.skip.sometimes is neither a test form nor a known non-test',
    ]);
  });

  it('counts a refused call as no test', () => {
    const scan = read(`it.todoo('x', () => {});`);
    expect(
      searched(scan.testCalls, { of: scan.examined, what: 'calls on it' }),
    ).toEqual([]);
    expect(
      floorBreach('one-test-per-case/refused-calls', scan.examined),
    ).toBeUndefined();
  });
});

/**
 * Every looped site in the suite on the day #58 landed (24), split by #59 to
 * #62 and empty since. `file :: test :: loop`. The guard fails on a site
 * missing from this list AND on an entry that no longer matches a site. Never
 * add an entry: split the loop, or declare a runtime population or one
 * scenario above it with its reason.
 */
const BURN_DOWN: readonly string[] = [];

const TEST_FILE = /\.(test|spec)\.ts$/;

/** A test call in raw text: `it(`, `test.skip(`, `it.each(`, never `regex.test(`. */
const RAW_TEST_CALL = /(^|[^\w.$])(it|test)(\.\w+)*\s*\(/m;

/** Every tracked test file and what the detector read in it, scanned inside each test, never at collection. */
const scan = () => {
  const files = committableFiles().filter((path) => TEST_FILE.test(path));
  const read = files.map((file) => {
    const source = readFileSync(file, 'utf8');
    return { file, source, scan: scanTests(source, file) };
  });
  const withTestCalls = read.filter(({ source }) => RAW_TEST_CALL.test(source));
  return {
    files,
    tests: read.reduce((n, { scan }) => n + scan.tests, 0),
    sites: read.flatMap(({ file, scan }) =>
      scan.looped.map((site) => `${file} :: ${site.test} :: ${site.loop}`),
    ),
    unclassified: read.flatMap(({ file, scan }) =>
      scan.unclassified.map((what) => `${file} ${what}`),
    ),
    withTestCalls: withTestCalls.length,
    unread: withTestCalls
      .filter(({ scan }) => scan.tests < 1)
      .map(({ file }) => file),
  };
};

describe('the suite', () => {
  it('scans every committable test file, this one included', () => {
    const { files } = scan();
    expect(files).toContain('tests/unit/one-test-per-case.test.ts');
    expect(files).toContain('tests/engines/golden-vectors.spec.ts');
    // Measured 32 at b2a6f3f (#82). Lower it only in the commit that removes a test file.
    expect(files.length).toBeGreaterThan(31);
  });

  it('reads the tests in them, counted as tests, not files (Refs #82)', () => {
    // Measured 392 at #82's head. Lower it only in the commit that removes tests.
    expect(scan().tests).toBeGreaterThan(391);
  });

  it('reads at least one test in every file whose text holds a test call', () => {
    const { withTestCalls, unread } = scan();
    // Measured 32 at b2a6f3f (#82): every test file holds one.
    expect(withTestCalls).toBeGreaterThan(31);
    expect(unread).toEqual([]);
  });

  it('classifies every call on it and test, refusing by name what it cannot read', () => {
    expect(scan().unclassified).toEqual([]);
  });

  it('loops no known population inside a test beyond the burn-down list', () => {
    expect(minus(scan().sites, BURN_DOWN)).toEqual([]);
  });

  it('keeps no burn-down entry that has already been split', () => {
    expect(minus(BURN_DOWN, scan().sites)).toEqual([]);
  });
});
