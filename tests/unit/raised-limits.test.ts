import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { raisedLimitsIn, UNIT_LIMIT_MS } from './raised-limits';

/**
 * The reader behind the raised-limit guard (#477 AC3): every way a unit test
 * file or a unit config can raise a limit, planted, and the forms it leaves
 * alone, each counted as read. The guard over the repository is in
 * tests/guards/raised-limits.test.ts.
 */

const parse = (source: string) =>
  raisedLimitsIn(
    ts.createSourceFile('f.test.ts', source, ts.ScriptTarget.Latest, true),
  );

// Vitest's names, imported on the fixture's own first line so its lines stay
// as written: the reader judges a call only when the file imports its name.
const IMPORT =
  "import { afterEach, beforeAll, beforeEach, describe, it, onTestFinished, suite, test, vi } from 'vitest'; ";
const read = (source: string) => parse(IMPORT + source);

// Built in code: a raised limit typed into a fixture reads as one to the
// machine-wide edit hook, and the value is what is tested, not its spelling.
const OVER = String(UNIT_LIMIT_MS * 2);

describe('the forms that raise a limit, each refused (#477 AC3)', () => {
  it.each([
    [
      'a numeric third argument',
      `it('t', () => {}, ${OVER});`,
      `it: a third argument, ${OVER}, sets a limit`,
    ],
    [
      'a named third argument',
      "it('t', () => {}, LIMIT);",
      'it: a third argument, LIMIT, sets a limit',
    ],
    [
      '{ timeout } before the body',
      `it('t', { timeout: ${OVER} }, () => {});`,
      'it: { timeout } in its options sets a limit',
    ],
    [
      '{ timeout } after the body',
      `test('t', () => {}, { timeout: ${OVER} });`,
      'test: { timeout } in its options sets a limit',
    ],
    [
      'a shorthand { timeout }',
      "it('t', { timeout }, () => {});",
      'it: { timeout } in its options sets a limit',
    ],
    [
      "a quoted { 'timeout' }",
      `it('t', { 'timeout': ${OVER} }, () => {});`,
      'it: { timeout } in its options sets a limit',
    ],
    [
      'options spread from elsewhere',
      "it('t', { ...options }, () => {});",
      'it: options with a spread cannot be read for a timeout',
    ],
    [
      'named options',
      "it('t', options, () => {});",
      'it: options options cannot be read for a timeout',
    ],
    [
      'a suite’s options',
      `describe('s', { timeout: ${OVER} }, () => {});`,
      'describe: { timeout } in its options sets a limit',
    ],
    [
      'a suite’s third argument',
      `suite('s', () => {}, ${OVER});`,
      `suite: a third argument, ${OVER}, sets a limit`,
    ],
    [
      'a table form’s third argument',
      `it.each([1])('t %i', () => {}, ${OVER});`,
      `it.each: a third argument, ${OVER}, sets a limit`,
    ],
    [
      'a condition form’s options',
      `test.runIf(true)('t', { timeout: ${OVER} }, () => {});`,
      'test.runIf: { timeout } in its options sets a limit',
    ],
    [
      'a modifier chain’s third argument',
      `test.concurrent('t', () => {}, ${OVER});`,
      `test.concurrent: a third argument, ${OVER}, sets a limit`,
    ],
    [
      'a hook’s numeric second argument',
      `beforeAll(() => {}, ${OVER});`,
      `beforeAll: a second argument, ${OVER}, sets a limit`,
    ],
    [
      'a hook’s named second argument',
      'afterEach(async () => {}, LIMIT);',
      'afterEach: a second argument, LIMIT, sets a limit',
    ],
    [
      'a test-scoped hook’s second argument',
      `onTestFinished(() => {}, ${OVER});`,
      `onTestFinished: a second argument, ${OVER}, sets a limit`,
    ],
    [
      'vi.setConfig called',
      'vi.setConfig({});',
      'vi.setConfig changes a limit at run time',
    ],
    [
      'vi.setConfig named, not called',
      'const set = vi.setConfig;',
      'vi.setConfig changes a limit at run time',
    ],
    [
      'testTimeout above the limit',
      `export default { test: { testTimeout: ${OVER} } };`,
      `testTimeout: ${OVER} is not a limit from 1 to ${String(UNIT_LIMIT_MS)} ms`,
    ],
    [
      'hookTimeout above the limit',
      `export default { test: { hookTimeout: ${OVER} } };`,
      `hookTimeout: ${OVER} is not a limit from 1 to ${String(UNIT_LIMIT_MS)} ms`,
    ],
    [
      'teardownTimeout above the limit',
      `export default { test: { teardownTimeout: ${OVER} } };`,
      `teardownTimeout: ${OVER} is not a limit from 1 to ${String(UNIT_LIMIT_MS)} ms`,
    ],
    [
      'testTimeout 0, which turns the limit off',
      'export default { test: { testTimeout: 0 } };',
      `testTimeout: 0 is not a limit from 1 to ${String(UNIT_LIMIT_MS)} ms`,
    ],
    [
      'a named testTimeout',
      'export default { test: { testTimeout: LIMIT } };',
      `testTimeout: LIMIT is not a limit from 1 to ${String(UNIT_LIMIT_MS)} ms`,
    ],
  ])('%s', (_form, source, problem) => {
    expect(read(source)).toEqual({
      findings: [`f.test.ts:1: ${problem}`],
      sites: 1,
      declarations: 0,
    });
  });

  it('names each finding’s own line', () => {
    expect(
      read(`it('a', () => {});\n\nbeforeEach(() => {}, ${OVER});\n`).findings,
    ).toEqual([
      `f.test.ts:3: beforeEach: a second argument, ${OVER}, sets a limit`,
    ]);
  });
});

describe('the forms that leave the limit alone, each read (#477 AC3)', () => {
  it.each([
    ['a test', "it('t', () => {});", 1],
    ['an async test', "test('t', async () => {});", 1],
    ['a title alone', "it.todo('t');", 1],
    [
      'options without a timeout',
      "it('t', { concurrent: false }, () => {});",
      1,
    ],
    [
      'a suite and the test in it',
      "describe('s', () => { it('t', () => {}); });",
      2,
    ],
    ['a table form', "it.each([1])('t %i', () => {});", 1],
    ['a hook', 'beforeEach(() => {});', 1],
    [
      'limits at the unit limit',
      `export default { test: { testTimeout: ${String(UNIT_LIMIT_MS)}, hookTimeout: ${String(UNIT_LIMIT_MS)} } };`,
      2,
    ],
    ['a timeout passed to something else', 'setTimeout(() => {}, 5_000);', 0],
    ['a timeout option of something else', 'run({ timeout: 5_000 });', 0],
    ['a testTimeout read, not set', 'const t = config.test?.testTimeout;', 0],
  ])('%s', (_form, source, sites) => {
    expect(read(source)).toEqual({ findings: [], sites, declarations: 0 });
  });
});

describe('every test call is judged, wherever its name comes from (#477 AC3)', () => {
  it('judges a test imported from a helper module', () => {
    expect(
      parse(`import { test } from './fixtures'; test('t', () => {}, ${OVER});`),
    ).toEqual({
      findings: [`f.test.ts:1: test: a third argument, ${OVER}, sets a limit`],
      sites: 1,
      declarations: 0,
    });
  });

  it('judges a test built with test.extend, and the extend call itself', () => {
    expect(
      parse(
        `import { test } from 'vitest'; const it = test.extend({}); it('t', () => {}, ${OVER});`,
      ),
    ).toEqual({
      findings: [`f.test.ts:1: it: a third argument, ${OVER}, sets a limit`],
      sites: 2,
      declarations: 0,
    });
  });

  it('judges a test whose name the file never imports', () => {
    expect(parse(`it('t', () => {}, ${OVER});`)).toEqual({
      findings: [`f.test.ts:1: it: a third argument, ${OVER}, sets a limit`],
      sites: 1,
      declarations: 0,
    });
  });

  it('refuses a file’s own function named like a test, so no call goes unjudged', () => {
    expect(
      parse("const suite = (n: string, why?: string) => n; suite('a', 'b');"),
    ).toEqual({
      findings: [
        'f.test.ts:1: suite: the file’s own suite shadows Vitest’s; rename it so every test call can be judged',
      ],
      sites: 1,
      declarations: 0,
    });
  });

  it('refuses a file’s own hook look-alike, and counts its declaration', () => {
    expect(parse('function afterAll() {} afterAll();')).toEqual({
      findings: [
        'f.test.ts:1: afterAll: the file’s own afterAll shadows Vitest’s; rename it so every test call can be judged',
      ],
      sites: 1,
      declarations: 1,
    });
  });

  it('counts a method named describe as a declaration, with no call to judge', () => {
    expect(parse('interface R { describe(n: string): void }')).toEqual({
      findings: [],
      sites: 0,
      declarations: 1,
    });
  });

  it.each([
    [
      'a test name imported under another',
      "import { it as spec } from 'vitest';",
      'import { it as spec } renames a test name, so its calls cannot be told apart; import it under its own name',
    ],
    [
      'another name imported as a test name',
      "import { helper as it } from './fixtures';",
      'import { helper as it } renames a test name, so its calls cannot be told apart; import it under its own name',
    ],
    [
      'a namespace import of vitest',
      "import * as v from 'vitest';",
      "import * as v from 'vitest' cannot be read for limits",
    ],
  ])('refuses %s', (_form, source, problem) => {
    expect(parse(source)).toEqual({
      findings: [`f.test.ts:1: ${problem}`],
      sites: 0,
      declarations: 0,
    });
  });

  it('refuses vi.setConfig on any vi', () => {
    expect(parse('const vi = { setConfig() {} }; vi.setConfig({});')).toEqual({
      findings: ['f.test.ts:1: vi.setConfig changes a limit at run time'],
      sites: 1,
      declarations: 0,
    });
  });
});
