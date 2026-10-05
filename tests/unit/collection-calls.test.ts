import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { minus } from './burn-down';
import {
  scanCollection,
  type CollectionScan,
  type RefusedCall,
} from './collection-calls';
import { committableFiles } from './tracked-files';

/**
 * No workspace code at collection (Refs #97).
 *
 * Vitest runs a file's module scope and every `describe` callback while it
 * COLLECTS the file, before any test exists. When code evaluated there
 * throws, the whole file fails to collect and its tests vanish from the
 * total instead of failing one by one: #33's mutation M1.1 dropped six tests
 * that way, and its T4 red run lost all of `grammar.test.ts`. A setup computed
 * inside a test or a hook fails that test, by name.
 *
 * The question asked is whether a call evaluated at collection can REACH
 * workspace code. Workspace code enters a test file only through an import of
 * a relative path or an `@yawelo-idle/` package, so the detector resolves each
 * call's root name: such an import is refused, apart from the clock brands
 * `simMs` and `wallMs`; a function declared in the file is followed into its
 * body; a runtime global, a third-party package and a method on local data
 * are allowed. Each fixture below imports `integrate` and `simMs` on line 1.
 */
const IMPORTS =
  "import { integrate } from '../src/sim'; import { simMs } from '../src/clock';\n";

const read = (body: string): CollectionScan =>
  scanCollection(IMPORTS + body, 'fixture.test.ts');
const refused = (body: string): readonly RefusedCall[] => read(body).refused;

describe('the detector refuses a call that reaches workspace code', () => {
  it('in a describe body, with its scope, line, call and the import it reaches', () => {
    expect(
      refused(`describe('d', () => {
  const s = integrate(1);
  it('t', () => expect(s).toBe(1));
});`),
    ).toEqual([
      {
        scope: 'd',
        line: 3,
        call: 'integrate',
        reaches: 'integrate (../src/sim)',
      },
    ]);
  });

  const PLACES: readonly (readonly [string, string, string, number])[] = [
    [
      'in a nested describe',
      `describe('outer', () => {
  describe('inner', () => {
    const s = integrate(1);
  });
});`,
      'outer > inner',
      4,
    ],
    [
      'written over several lines',
      `describe('d', () => {
  const s =
    integrate(
      1,
    );
});`,
      'd',
      4,
    ],
    [
      'as a bare expression statement',
      `describe('d', () => {
  integrate(1);
});`,
      'd',
      3,
    ],
    ['at module scope', `const s = integrate(1);`, '(module)', 2],
    [
      'in an it.each table',
      `describe('d', () => {
  it.each([[integrate(1)]])('t %s', (s) => expect(s).toBe(1));
});`,
      'd',
      3,
    ],
    [
      'in a describe.each table',
      `describe.each([[integrate(1)]])('d %s', (s) => {});`,
      '(module)',
      2,
    ],
    [
      'in a test title',
      "describe('d', () => {\n  it(`t ${integrate(1)}`, () => {});\n});",
      'd',
      3,
    ],
    [
      'in a loop that generates one test per case',
      `describe('d', () => {
  for (const n of [1, 2]) {
    const s = integrate(n);
    it(\`t \${String(n)}\`, () => expect(s).toBe(1));
  }
});`,
      'd',
      4,
    ],
    [
      'inside a callback a call runs at collection',
      `describe('d', () => {
  const xs = [1, 2].map((n) => integrate(n));
});`,
      'd',
      3,
    ],
    [
      'in a Playwright test.describe body',
      `test.describe('d', () => {
  const s = integrate(1);
});`,
      'd',
      3,
    ],
    [
      'in a beforeAll hook, whose throw skips its tests instead of failing them',
      `describe('d', () => {
  beforeAll(() => {
    integrate(1);
  });
});`,
      'd > beforeAll',
      4,
    ],
    [
      'in a Playwright test.beforeAll hook',
      `test.beforeAll(async () => {
  await integrate(1);
});`,
      'beforeAll',
      3,
    ],
    [
      "in a tagged template's substitution",
      'const s = String.raw`x${integrate(1)}`;',
      '(module)',
      2,
    ],
    [
      'in a describe titled by a template',
      'describe(`d ${String(1)}`, () => {\n  integrate(1);\n});',
      'd ${String(1)}',
      3,
    ],
    [
      'in a describe.skipIf condition',
      `describe.skipIf(integrate(1))('d', () => {});`,
      '(module)',
      2,
    ],
  ];
  for (const [where, body, scope, line] of PLACES)
    it(where, () => {
      expect(refused(body)).toEqual([
        { scope, line, call: 'integrate', reaches: 'integrate (../src/sim)' },
      ]);
    });

  const FORMS: readonly (readonly [string, string, string, string])[] = [
    [
      'a namespace import',
      `import * as core from '../src/index';
const s = core.integrate(1);`,
      'core.integrate',
      'core (../src/index)',
    ],
    [
      'a default import',
      `import sim from '../src/sim';
const s = sim(1);`,
      'sim',
      'sim (../src/sim)',
    ],
    [
      'a renamed import',
      `import { integrate as go } from '../src/sim';
const s = go(1);`,
      'go',
      'go (../src/sim)',
    ],
    [
      'an import of the core package',
      `import { stateHash } from '@yawelo-idle/core';
const s = stateHash(1);`,
      'stateHash',
      'stateHash (@yawelo-idle/core)',
    ],
    [
      'a constructor from workspace code',
      `import { Ledger } from '../src/ledger';
const s = new Ledger();`,
      'Ledger',
      'Ledger (../src/ledger)',
    ],
    [
      'a method on a value from workspace code',
      `import { COURSE } from '../src/course';
const s = COURSE.regions.map((r) => r);`,
      'COURSE.regions.map',
      'COURSE (../src/course)',
    ],
    [
      'a workspace function passed to a call that may run it',
      `const s = [1, 2].map(integrate);`,
      '[1, 2].map',
      'integrate (../src/sim)',
    ],
    [
      'a local function that calls workspace code',
      `function stateAt(n: number) {
  return integrate(n);
}
const s = stateAt(1);`,
      'stateAt',
      'stateAt -> integrate (../src/sim)',
    ],
    [
      'a local arrow function that calls workspace code',
      `const stateAt = (n: number) => integrate(n);
const s = stateAt(1);`,
      'stateAt',
      'stateAt -> integrate (../src/sim)',
    ],
    [
      'a local function that reaches it through another',
      `function inner() {
  return integrate(1);
}
function outer() {
  return inner();
}
const s = outer();`,
      'outer',
      'outer -> inner -> integrate (../src/sim)',
    ],
    [
      'a local function that reaches it only in a nested callback',
      `function all() {
  return [1, 2].map((n) => integrate(n));
}
const s = all();`,
      'all',
      'all -> integrate (../src/sim)',
    ],
    [
      'a local function that calls itself and workspace code',
      `function down(n: number): number {
  return n > 0 ? down(n - 1) : integrate(0);
}
const s = down(3);`,
      'down',
      'down -> integrate (../src/sim)',
    ],
    [
      'two local functions that call each other, one reaching it',
      `function a(n: number): number {
  return n === 0 ? 0 : b(n - 1);
}
function b(n: number): number {
  return a(n) + integrate(n);
}
const s = a(3);`,
      'a',
      'a -> b -> integrate (../src/sim)',
    ],
    [
      'a local function passed to a call that may run it',
      `function stateAt(n: number) {
  return integrate(n);
}
const s = [1, 2].map(stateAt);`,
      '[1, 2].map',
      'stateAt -> integrate (../src/sim)',
    ],
    [
      'a clock brand through a local function that also calls workspace code',
      `function t(n: number) {
  return integrate(simMs(n));
}
const s = t(1);`,
      't',
      't -> integrate (../src/sim)',
    ],
    [
      'a clock brand name imported from a module that is not the clock',
      `import { wallMs } from '../src/sim';
const t = wallMs(1);`,
      'wallMs',
      'wallMs (../src/sim)',
    ],
    [
      'a function from the clock module that is not a brand',
      `import { reanchor } from '../src/clock';
const s = reanchor(1);`,
      'reanchor',
      'reanchor (../src/clock)',
    ],
    [
      'a workspace function cast with as',
      `const s = (integrate as (n: number) => number)(1);`,
      '(integrate as (n: number) => number)',
      'integrate (../src/sim)',
    ],
    [
      'a workspace function asserted non-null',
      `const s = integrate!(1);`,
      'integrate!',
      'integrate (../src/sim)',
    ],
    [
      'a workspace function checked with satisfies',
      `const s = (integrate satisfies unknown as typeof integrate)(1);`,
      '(integrate satisfies unknown as typeof integrate)',
      'integrate (../src/sim)',
    ],
    [
      'an element read on a workspace namespace',
      `import * as core from '../src/index';
const s = core['integrate'](1);`,
      "core['integrate']",
      'core (../src/index)',
    ],
    [
      'a callee written over several lines',
      `import * as core from '../src/index';
const s = core
  .integrate(1);`,
      'core .integrate',
      'core (../src/index)',
    ],
    [
      'an alias of a workspace function',
      `const go = integrate;
const s = go(1);`,
      'go',
      'integrate (../src/sim)',
    ],
    [
      'an alias of a local function that calls workspace code',
      `function stateAt(n: number) {
  return integrate(n);
}
const f = stateAt;
const s = f(1);`,
      'f',
      'stateAt -> integrate (../src/sim)',
    ],
    [
      'a name destructured from a workspace namespace',
      `import * as core from '../src/index';
const { integrate: go } = core;
const s = go(1);`,
      'go',
      'core (../src/index)',
    ],
    [
      'a method on a literal, passed a workspace function',
      `const s = [1].slice(0).map(integrate);`,
      '[1].slice(0).map',
      'integrate (../src/sim)',
    ],
    [
      'a shared suite function whose describe body calls workspace code',
      `function suite(n: number) {
  describe('s', () => {
    const x = integrate(n);
  });
}
suite(1);`,
      'suite',
      'suite -> integrate (../src/sim)',
    ],
  ];
  for (const [form, body, call, reaches] of FORMS)
    it(`through ${form}`, () => {
      expect(refused(body).map((r) => [r.call, r.reaches])).toEqual([
        [call, reaches],
      ]);
    });
});

describe('the detector allows', () => {
  const ALLOWED: readonly (readonly [string, string, number])[] = [
    [
      'a call inside a test',
      `describe('d', () => {
  it('t', () => expect(integrate(1)).toBe(1));
});`,
      0,
    ],
    [
      'a call inside a hook',
      `describe('d', () => {
  let s = 0;
  beforeEach(() => {
    s = integrate(1);
  });
  it('t', () => expect(s).toBe(1));
});`,
      0,
    ],
    [
      'a call inside a helper function the describe body only declares',
      `describe('d', () => {
  const make = () => integrate(1);
  function again() {
    return integrate(2);
  }
  it('t', () => expect(make()).toBe(again()));
});`,
      0,
    ],
    [
      'a call inside a test of a describe.each',
      `describe.each([[1]])('d %s', (n) => {
  it('t', () => expect(integrate(n)).toBe(1));
});`,
      0,
    ],
    ['a clock brand', `const t = simMs(1);`, 1],
    [
      'a clock brand imported from the core package',
      `import { wallMs } from '@yawelo-idle/core';
const t = wallMs(1);`,
      1,
    ],
    [
      'a clock brand imported under another name',
      `import { simMs as at } from '../src/clock';
const t = at(1);`,
      1,
    ],
    [
      'a third-party package',
      `import fc from 'fast-check';
const n = fc.integer({ min: 0 }).map((x) => x + 1);`,
      2,
    ],
    [
      'a fast-check arbitrary whose callback calls workspace code, which runs inside the property',
      `import fc from 'fast-check';
const s = fc.integer().map((x) => integrate(x));`,
      2,
    ],
    [
      'a function passed to a call that runs it later, such as a server handler',
      `import { createServer } from 'node:http';
const server = createServer(() => integrate(1));`,
      1,
    ],
    [
      'a runtime global',
      `const t = String(Object.keys({ a: 1 }).length) + btoa('x');`,
      3,
    ],
    [
      'a method on local data',
      `const IDS = ['a', 'b'];
const ks = IDS.slice(1).map((id) => id.toUpperCase());`,
      3,
    ],
    [
      'a value a third-party call returned',
      `import Decimal from 'decimal.js';
const D = Decimal.clone({ precision: 20 });
const x = new D('1.15');`,
      2,
    ],
    [
      'a method on a string, a template, a number, an array or an object literal',
      "const t = 'ab'.repeat(2) + `x${String(1)}`.trim() + (1).toFixed(0) + [1].join('') + ({}).toString();",
      6,
    ],
    [
      'a local fixture that calls only allowed code',
      `function region(r: number) {
  return { id: String(r), words: Array.from({ length: 3 }, (_, i) => i) };
}
const R = region(1);`,
      1,
    ],
    [
      'a local fixture passed to a call',
      `function region(r: number) {
  return { id: String(r) };
}
const RS = [1, 2].map(region);`,
      1,
    ],
    [
      'a name a describe body declares, shadowing an import',
      `describe('d', () => {
  const integrate = (n: number) => n;
  const s = integrate(1);
});`,
      1,
    ],
    [
      'a type-only import, which binds no value, so the global keeps its name',
      `import type { String } from '../src/strings';
const t = String(1);`,
      1,
    ],
    [
      'a type-only import specifier, which binds no value either',
      `import { type String } from '../src/strings';
const t = String(1);`,
      1,
    ],
    [
      'a workspace value passed to a call that runs no function argument',
      `import { LIMIT } from '../src/limits';
const t = String(LIMIT);`,
      1,
    ],
    [
      'a workspace value read but not called',
      `import { START } from '../src/clock';
const t = START;`,
      0,
    ],
  ];
  for (const [what, body, judged] of ALLOWED)
    it(what, () => {
      const scan = read(body);
      expect(scan.judged, 'the calls evaluated at collection were read').toBe(
        judged,
      );
      expect(scan.refused).toEqual([]);
      expect(scan.unclassified).toEqual([]);
    });
});

describe('the detector counts what it read', () => {
  it('counts each describe callback, nested ones included', () => {
    expect(
      read(`describe('a', () => {
  describe('b', () => {});
  describe.each([[1]])('c %s', () => {});
});
describe.skip('d', function () {});`).describes,
    ).toBe(4);
  });

  it('counts the calls evaluated at collection, refused or allowed', () => {
    expect(
      read(`const a = String(1);
describe('d', () => {
  const b = integrate(1);
  it('t', () => expect(integrate(2)).toBe(String(3)));
});`).judged,
    ).toBe(2);
  });

  it('reads test.describe.configure as no callback, refusing nothing', () => {
    const scan = read(`test.describe.configure({ mode: 'serial' });`);
    expect(scan.describes).toBe(0);
    expect(scan.unclassified).toEqual([]);
  });

  it('reads describe.todo as no callback, refusing nothing', () => {
    const scan = read(`describe.todo('later');`);
    expect(scan.describes).toBe(0);
    expect(scan.unclassified).toEqual([]);
  });
});

describe('the detector refuses what it cannot read, by name', () => {
  it('a describe whose callback is not written inline', () => {
    expect(
      read(`const body = () => {};
describe('named', body);`).unclassified,
    ).toEqual(["line 3: describe('named') has no inline callback to read"]);
  });

  it('a beforeAll whose callback is not written inline', () => {
    expect(
      read(`const setup = () => {};
beforeAll(setup);`).unclassified,
    ).toEqual(['line 3: beforeAll has no inline callback to read']);
  });

  it('a member of describe it does not know', () => {
    expect(read(`describe.sometimes('d', () => {});`).unclassified).toEqual([
      'line 2: describe.sometimes is not a known describe form',
    ]);
  });

  it('a member of test.describe it does not know', () => {
    expect(
      read(`test.describe.sometimes('d', () => {});`).unclassified,
    ).toEqual(['line 2: test.describe.sometimes is not a known describe form']);
  });

  it('a direct call of a value, which may be any function', () => {
    expect(
      read(`describe.each([[(n: number) => n]])('d', (f) => {
  const s = f(1);
});`).unclassified,
    ).toEqual([
      'line 3: f(1) calls a value, not a function the reader can follow',
    ]);
  });

  it('a direct call of a value a workspace call returned', () => {
    expect(
      read(`import { make } from '../src/make';
const f = make();
const s = f(1);`).unclassified,
    ).toEqual([
      'line 4: f(1) calls a value, not a function the reader can follow',
    ]);
  });

  const VALUES: readonly (readonly [string, string, string])[] = [
    [
      'a loop variable',
      `for (const f of [String]) {
  const s = f(1);
}`,
      'line 3: f(1) calls a value, not a function the reader can follow',
    ],
    [
      'a caught value',
      `try {
  String(1);
} catch (f) {
  f();
}`,
      'line 5: f() calls a value, not a function the reader can follow',
    ],
    [
      'a name in a cycle of aliases',
      `const a = b;
const b = a;
const s = a(1);`,
      'line 4: a(1) calls a value, not a function the reader can follow',
    ],
    [
      'a class declared in the file, which the reader does not follow',
      `class Ledger {}
const l = new Ledger();`,
      'line 3: new Ledger() calls a value, not a function the reader can follow',
    ],
  ];
  for (const [what, body, refusal] of VALUES)
    it(`a direct call of ${what}`, () => {
      expect(read(body).unclassified).toEqual([refusal]);
    });

  it('a call inside a local function that the reader cannot follow, through the call that runs it', () => {
    expect(
      read(`function f() {
  return (Math.random() > 1 ? integrate : String)(1);
}
const s = f();`).unclassified,
    ).toEqual([
      'line 5: f -> (Math.random() > 1 ? integrate : String)(1) has no root name to resolve',
    ]);
  });

  it('a describe with no arguments, by its empty title', () => {
    expect(read(`describe();`).unclassified).toEqual([
      "line 2: describe('') has no inline callback to read",
    ]);
  });

  it('a describe form it does not know, inside a function collection runs', () => {
    expect(
      read(`function suite() {
  describe.sometimes('s', () => {});
}
suite();`).unclassified,
    ).toEqual([
      'line 5: suite -> describe.sometimes is not a known describe form',
    ]);
  });

  it('a call whose callee has no name to resolve', () => {
    expect(
      read(`const s = (Math.random() > 1 ? integrate : String)(1);`)
        .unclassified,
    ).toEqual([
      'line 2: (Math.random() > 1 ? integrate : String)(1) has no root name to resolve',
    ]);
  });
});

/**
 * Every call that reached workspace code at collection on the day #97's guard
 * landed (12, in four files), converted by #97 and empty since.
 * `file :: scope :: call -> reaches`. The guard fails on a site missing from
 * this list AND on an entry that no longer matches a site. Never add an
 * entry: compute the value inside the test, or in a `beforeEach` (a throwing
 * `beforeAll` skips its tests instead of failing them).
 */
const BURN_DOWN: readonly string[] = [];

const TEST_FILE = /\.(test|spec)\.ts$/;

/** A describe call in raw text: `describe(`, `describe.each(`, `test.describe(`. */
const RAW_DESCRIBE_CALL = /(^|[^\w.$])((it|test)\.)?describe(\.\w+)*\s*\(/m;

/** Every tracked test file and what the detector read in it, scanned inside each test, never at collection. */
const scan = () => {
  const files = committableFiles().filter((path) => TEST_FILE.test(path));
  const read = files.map((file) => {
    const source = readFileSync(file, 'utf8');
    return { file, source, scan: scanCollection(source, file) };
  });
  const withDescribe = read.filter(({ source }) =>
    RAW_DESCRIBE_CALL.test(source),
  );
  return {
    files,
    describes: read.reduce((n, { scan }) => n + scan.describes, 0),
    judged: read.reduce((n, { scan }) => n + scan.judged, 0),
    sites: read.flatMap(({ file, scan }) =>
      scan.refused.map(
        (site) => `${file} :: ${site.scope} :: ${site.call} -> ${site.reaches}`,
      ),
    ),
    unclassified: read.flatMap(({ file, scan }) =>
      scan.unclassified.map((what) => `${file} ${what}`),
    ),
    withDescribe: withDescribe.length,
    unread: withDescribe
      .filter(({ scan }) => scan.describes < 1)
      .map(({ file }) => file),
  };
};

describe('the suite', () => {
  it('scans every committable test file, this one included', () => {
    const { files } = scan();
    expect(files).toContain('tests/unit/collection-calls.test.ts');
    expect(files).toContain('packages/core/test/grammar.test.ts');
    expect(files).toContain('tests/engines/golden-vectors.spec.ts');
    // Measured 44 at T2's head (#97). Lower it only in the commit that removes a test file.
    expect(files.length).toBeGreaterThan(43);
  });

  it('reads the describe callbacks in them, counted as callbacks, not files', () => {
    // Measured 153 at T2's head (#97). Lower it only in the commit that removes describes.
    expect(scan().describes).toBeGreaterThan(152);
  });

  it('judges the calls they evaluate at collection, counted as calls', () => {
    // Measured 270 at #97's head, its last site converted. Lower it only in the commit that moves calls out of collection.
    expect(scan().judged).toBeGreaterThan(269);
  });

  it('reads a describe callback in every file whose text holds a describe call', () => {
    const { withDescribe, unread } = scan();
    // Measured 43 at T2's head (#97).
    expect(withDescribe).toBeGreaterThan(42);
    expect(unread).toEqual([]);
  });

  it('classifies every call evaluated at collection, refusing by name what it cannot follow', () => {
    expect(scan().unclassified).toEqual([]);
  });

  it('reaches no workspace code at collection beyond the burn-down list', () => {
    expect(minus(scan().sites, BURN_DOWN)).toEqual([]);
  });

  it('keeps no burn-down entry that has already been converted', () => {
    expect(minus(BURN_DOWN, scan().sites)).toEqual([]);
  });
});
