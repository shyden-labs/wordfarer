import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import ts from 'typescript';
import { parse } from 'yaml';
import {
  FLOORS_MODULE,
  SUITES,
  TYPESCRIPT_FILES,
  ciRefusal,
  decideRecord,
  describeMoves,
  findFloorCallers,
  floorsFileOf,
  floorsText,
  planRecord,
  playwrightListed,
  readFloorCaller,
  readFloorsDir,
  runRefusal,
  suiteFiles,
  vitestListed,
  writeFloors,
  type Suite,
} from '../../scripts/record-floors';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { codeWithoutLiterals } from './source-text';
import { committableFiles } from './tracked-files';
import { runOf } from './workflow-steps';

/**
 * The floor recorder (#361): raises recorded figures, never lowers one,
 * refuses one id asserted from two places, never runs in CI, and runs every
 * suite that holds a floor, not only the root unit suite.
 */
const at = (id: string, actual: number, site = 'tests/unit/a.test.ts:1') => ({
  id,
  actual,
  site,
});

describe('decideRecord', () => {
  it('adds a new id at the count it read', () => {
    expect(decideRecord({}, [at('g/new', 3)])).toEqual({
      next: { 'g/new': 3 },
      refusals: [],
    });
  });

  it('raises a figure that grew', () => {
    expect(decideRecord({ 'g/a': 3 }, [at('g/a', 5)])).toEqual({
      next: { 'g/a': 5 },
      refusals: [],
    });
  });

  it('keeps a figure that matches', () => {
    expect(decideRecord({ 'g/a': 3 }, [at('g/a', 3), at('g/a', 3)])).toEqual({
      next: { 'g/a': 3 },
      refusals: [],
    });
  });

  it('refuses a figure that would fall, and keeps it', () => {
    expect(decideRecord({ 'g/a': 5 }, [at('g/a', 4)])).toEqual({
      next: { 'g/a': 5 },
      refusals: [
        'g/a would fall from 5 to 4: a blind reader looks like this. If the ' +
          'corpus really shrank, lower it in tests/floors/g.json by hand and say ' +
          'why in the commit.',
      ],
    });
  });

  it('refuses one id asserted from two places', () => {
    expect(
      decideRecord({}, [
        at('g/a', 2, 'tests/unit/a.test.ts:4'),
        at('g/a', 2, 'tests/unit/b.test.ts:9'),
      ]).refusals,
    ).toEqual([
      'g/a is asserted from two places: tests/unit/a.test.ts:4, tests/unit/b.test.ts:9',
    ]);
  });

  it('refuses one id that read two values', () => {
    expect(decideRecord({}, [at('g/a', 2), at('g/a', 3)]).refusals).toEqual([
      'g/a read two different values: 2, 3',
    ]);
  });

  it('refuses a recorded id that no test asserted', () => {
    expect(decideRecord({ 'g/gone': 2 }, []).refusals).toEqual([
      'g/gone is recorded but no test asserted it: remove it from ' +
        'tests/floors/g.json with the floor that used it, or run every suite',
    ]);
  });
});

describe('describeMoves', () => {
  it('prints each move, largest first, new ids by their count', () => {
    expect(
      describeMoves(
        { 'g/a': 1, 'g/b': 10, 'g/same': 4 },
        { 'g/a': 2, 'g/b': 15, 'g/new': 3, 'g/same': 4 },
      ),
    ).toEqual(['g/b: 10 -> 15 (+5)', 'g/new: new, 3', 'g/a: 1 -> 2 (+1)']);
  });

  it('orders equal moves by id', () => {
    expect(describeMoves({}, { 'g/z': 1, 'g/a': 1 })).toEqual([
      'g/a: new, 1',
      'g/z: new, 1',
    ]);
  });
});

describe('floorsFileOf (#406)', () => {
  it("names the guard's own file, from the id's text before its first slash", () => {
    expect(floorsFileOf('supply-chain/pinned-uses')).toBe(
      'tests/floors/supply-chain.json',
    );
    expect(floorsFileOf('collection-calls/allowed/a call inside a test')).toBe(
      'tests/floors/collection-calls.json',
    );
  });

  it.each([
    ['an id with no slash', 'units'],
    ['an empty guard', '/units'],
    ['an empty name', 'guard/'],
    ['a guard that is no file name', 'Guard.x/units'],
  ])('refuses %s by name', (_what, id) => {
    expect(() => floorsFileOf(id)).toThrow(
      `${id} is not a floor id: write guard/name, the guard in lower-case words joined by hyphens`,
    );
  });
});

/** A fresh directory per test, removed after it. */
const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true });
});
const tempDir = (files: Readonly<Record<string, string>> = {}): string => {
  const dir = mkdtempSync(join(tmpdir(), 'floors-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files))
    writeFileSync(join(dir, name), text);
  return dir;
};

describe('readFloorsDir (#406)', () => {
  it('returns the union of every guard file', () => {
    expect(
      readFloorsDir(
        tempDir({
          'a.json': '{\n  "a/x": 1,\n  "a/y": 2\n}\n',
          'b.json': '{\n  "b/z": 3\n}\n',
        }),
      ),
    ).toEqual({ 'a/x': 1, 'a/y': 2, 'b/z': 3 });
  });

  it.each([
    [
      'a key in the wrong file',
      { 'a.json': '{ "b/z": 3 }' },
      'a.json: b/z belongs in b.json',
    ],
    [
      'a figure that is not a count',
      { 'a.json': '{ "a/x": 1.5 }' },
      'a.json: a/x is 1.5, not a count',
    ],
    [
      'a negative figure',
      { 'a.json': '{ "a/x": -1 }' },
      'a.json: a/x is -1, not a count',
    ],
    [
      'a file that is not JSON',
      { 'a.json': '{ "a/x": ' },
      'a.json is not valid JSON',
    ],
    [
      'a file that is not an object',
      { 'a.json': '[1]' },
      'a.json does not hold an object of floors',
    ],
    [
      'a file that is no guard name',
      { 'A b.json': '{}' },
      'A b.json is not named for a guard',
    ],
    [
      'a file without the .json extension',
      { 'a.txt': '{}' },
      'a.txt is not a .json floors file',
    ],
  ])('refuses %s by name', (_what, files, refusal) => {
    expect(() => readFloorsDir(tempDir(files))).toThrow(refusal);
  });
});

describe('writeFloors (#406)', () => {
  it("writes only the files whose floors moved, in floorsText's form", () => {
    const dir = tempDir({
      'a.json': floorsText({ 'a/x': 1 }),
      'b.json': floorsText({ 'b/z': 3 }),
    });
    expect(writeFloors(dir, { 'a/x': 1, 'b/z': 4, 'c/n': 2 })).toEqual([
      'b.json',
      'c.json',
    ]);
    expect(readFileSync(join(dir, 'b.json'), 'utf8')).toBe(
      floorsText({ 'b/z': 4 }),
    );
    expect(readFileSync(join(dir, 'c.json'), 'utf8')).toBe(
      floorsText({ 'c/n': 2 }),
    );
    expect(readFloorsDir(dir)).toEqual({ 'a/x': 1, 'b/z': 4, 'c/n': 2 });
  });

  it('writes nothing when no floor moved', () => {
    const dir = tempDir({
      'a.json': floorsText({ 'a/x': 1 }),
      'b.json': floorsText({ 'b/z': 3 }),
    });
    const guardFiles = readdirSync(dir);
    expect(
      searched(writeFloors(dir, { 'a/x': 1, 'b/z': 3 }), {
        of: guardFiles,
        what: 'guard files compared',
      }),
    ).toEqual([]);
    expect(
      floorBreach('record-floors/unmoved-guard-files', guardFiles.length),
    ).toBeUndefined();
  });
});

describe('floorsText', () => {
  it('writes the ids sorted, two-space indented, with a final newline', () => {
    expect(floorsText({ 'g/b': 2, 'g/a': 1 })).toBe(
      '{\n  "g/a": 1,\n  "g/b": 2\n}\n',
    );
  });
});

/** A test file one directory below `tests/`, the house layout. */
const TEST_PATH = 'tests/unit/a.test.ts';
const CALL = "expect(floorBreach('a/b', 1)).toBeUndefined();";
const reads = (source: string, path = TEST_PATH) =>
  readFloorCaller(path, source);

describe('readFloorCaller: every import form TypeScript accepts (#448 AC2)', () => {
  it.each([
    [
      'an extensionless import',
      TEST_PATH,
      `import { floorBreach } from '../floors';\n${CALL}`,
    ],
    [
      'a .ts import',
      TEST_PATH,
      `import { floorBreach } from '../floors.ts';\n${CALL}`,
    ],
    [
      'a .js import',
      TEST_PATH,
      `import { floorBreach } from '../floors.js';\n${CALL}`,
    ],
    [
      'double quotes',
      TEST_PATH,
      `import { floorBreach } from "../floors";\n${CALL}`,
    ],
    [
      'a multi-line import among others',
      TEST_PATH,
      `import {\n  FLOORS_DIR,\n  floorBreach,\n} from '../floors';\n${CALL}`,
    ],
    [
      "#123's import, three directories up with .ts",
      'apps/web/test/game.test.ts',
      `import { floorBreach } from '../../../tests/floors.ts';\n${CALL}`,
    ],
    [
      'an import from the same directory',
      'tests/floors.test.ts',
      `import { floorBreach } from './floors';\n${CALL}`,
    ],
    [
      'an aliased import',
      TEST_PATH,
      "import { floorBreach as fb } from '../floors';\nexpect(fb('a/b', 1)).toBeUndefined();",
    ],
    [
      'a namespace import',
      TEST_PATH,
      "import * as floors from '../floors';\nexpect(floors.floorBreach('a/b', 1)).toBeUndefined();",
    ],
    [
      'a namespace read by its literal key',
      TEST_PATH,
      "import * as floors from '../floors';\nexpect(floors['floorBreach']('a/b', 1)).toBeUndefined();",
    ],
    [
      'the function handed on by reference',
      TEST_PATH,
      "import { floorBreach } from '../floors';\nexport const judge = floorBreach;",
    ],
  ])('reads %s as a caller', (_what, path, source) => {
    expect(reads(source, path)).toEqual({ calls: true, refusals: [] });
  });
});

describe('readFloorCaller: the name in text is no call (#448 AC1)', () => {
  it.each([
    ['the name in a comment', '// every floorBreach( call'],
    ['the name in a string', "const s = 'floorBreach(';"],
    ['the name in a template literal', 'const s = `floorBreach(`;'],
    ['an object key of that name', 'const o = { floorBreach: 1 };'],
    [
      'another name from the floors module',
      "import { readFloors } from '../floors';\nreadFloors();",
    ],
    [
      'another member of a floors namespace',
      "import * as floors from '../floors';\nfloors.readFloors();",
    ],
    ['an import never used', "import { floorBreach } from '../floors';"],
  ])('reads %s as no caller', (_what, source) => {
    expect(reads(source)).toEqual({ calls: false, refusals: [] });
  });

  it.each([
    ['the floors module itself', 'tests/floors.ts'],
    [
      'the recorder, which names it in prose and messages',
      'scripts/record-floors.ts',
    ],
    [
      'the floorless-searches guard, which names it in strings',
      'tests/unit/floorless-searches.ts',
    ],
    [
      'the literal-floors guard, which names it in strings',
      'tests/unit/literal-floors.ts',
    ],
  ])('reads %s as no caller', (_what, path) => {
    expect(reads(readFileSync(path, 'utf8'), path)).toEqual({
      calls: false,
      refusals: [],
    });
  });
});

describe('readFloorCaller: what it cannot follow, it refuses by name (#448 AC3)', () => {
  it.each([
    [
      'a call with no import',
      CALL,
      'calls floorBreach with no recognised import of it',
    ],
    [
      'a call imported from another module',
      `import { floorBreach } from './other';\n${CALL}`,
      'calls floorBreach with no recognised import of it',
    ],
    [
      'its own floorBreach',
      'function floorBreach() {}',
      'declares its own floorBreach',
    ],
    [
      'a re-export',
      "export { floorBreach } from '../floors';",
      're-exports floorBreach; import it from tests/floors directly',
    ],
    [
      'a dynamic import',
      "const floors = await import('../floors');",
      'imports tests/floors dynamically, which the recorder cannot follow',
    ],
    [
      'a namespace read by a computed key',
      "import * as floors from '../floors';\nconst k = 'floorBreach';\nfloors[k]('a/b', 1);",
      'reads tests/floors by a computed key',
    ],
    [
      'a namespace handed on whole',
      "import * as floors from '../floors';\nuse(floors);",
      'hands tests/floors on as a value',
    ],
    [
      'the name reached through another object',
      "helpers.floorBreach('a/b', 1);",
      'reaches floorBreach through helpers, which the recorder cannot follow',
    ],
  ])('refuses %s', (_what, source, why) => {
    expect(reads(source)).toEqual({
      calls: false,
      refusals: [`${TEST_PATH}: ${why}`],
    });
  });
});

describe('findFloorCallers (#448 AC3)', () => {
  it('returns each caller, refuses each file it cannot follow, and skips the home', () => {
    expect(
      findFloorCallers([
        { path: 'tests/floors.ts', source: 'export function floorBreach() {}' },
        {
          path: TEST_PATH,
          source: `import { floorBreach } from '../floors';\n${CALL}`,
        },
        { path: 'tests/unit/b.test.ts', source: CALL },
        { path: 'tests/unit/c.test.ts', source: "const s = 'floorBreach(';" },
      ]),
    ).toEqual({
      callers: [TEST_PATH],
      refusals: [
        'tests/unit/b.test.ts: calls floorBreach with no recognised import of it',
      ],
    });
  });
});

describe('ciRefusal', () => {
  it('refuses to record in CI', () => {
    expect(ciRefusal({ CI: 'true' })).toBe(
      'CI never records floors: run npm run floors:record locally',
    );
  });

  it.each([
    ['unset', undefined],
    ['empty', ''],
  ])('allows a record where CI is %s', (_what, value) => {
    expect(ciRefusal({ CI: value })).toBeUndefined();
  });
});

describe('runRefusal', () => {
  it('trusts a suite that exited 0', () => {
    expect(runRefusal('unit suite', { status: 0 })).toBeUndefined();
  });

  it('refuses a suite that failed', () => {
    expect(runRefusal('unit suite', { status: 1 })).toBe(
      'the unit suite failed (exit 1): nothing recorded',
    );
  });

  it('refuses a suite that did not start', () => {
    expect(
      runRefusal('unit suite', { status: null, error: new Error('ENOENT') }),
    ).toBe('the unit suite did not start: ENOENT');
  });
});

describe('the file lists', () => {
  it('reads vitest’s list one path a line, blank lines dropped', () => {
    expect(vitestListed('a.test.ts\n\n  b/c.test.ts\n')).toEqual([
      'a.test.ts',
      'b/c.test.ts',
    ]);
  });

  it('reads Playwright’s list relative to where it ran', () => {
    expect(
      playwrightListed('/repo')(
        JSON.stringify({
          config: { rootDir: '/repo/tests/engines' },
          suites: [{ file: 'a.spec.ts' }],
        }),
      ),
    ).toEqual(['tests/engines/a.spec.ts']);
  });

  it('joins a suite’s files to its directory', () => {
    const site = SUITES.find(({ name }) => name === 'site harness') as Suite;
    expect(suiteFiles(site, 'test/site.test.ts\n')).toEqual([
      'apps/site/test/site.test.ts',
    ]);
  });
});

const suite = (name: string, unrecordable?: string): Suite => ({
  name,
  cwd: '.',
  list: [],
  files: vitestListed,
  run: unrecordable === undefined ? ['run', name] : { unrecordable },
});
const UNIT = suite('unit');
const PACING = suite('pacing');
const WORKERD = suite('workerd', 'no file system');
const FIXTURE_SUITES = [UNIT, PACING, WORKERD];
const MEMBERSHIP = new Map([
  ['unit', ['u1.test.ts', 'u2.test.ts', 'both.test.ts']],
  ['pacing', ['p.test.ts', 'both.test.ts']],
  ['workerd', ['w.test.ts']],
]);

describe('planRecord', () => {
  it('runs each suite holding a caller once, in suite order', () => {
    expect(
      planRecord(
        ['p.test.ts', 'u2.test.ts', 'u1.test.ts'],
        FIXTURE_SUITES,
        MEMBERSHIP,
      ),
    ).toEqual({ run: [UNIT, PACING], refusals: [] });
  });

  it('runs no suite that holds no caller', () => {
    expect(planRecord(['u1.test.ts'], FIXTURE_SUITES, MEMBERSHIP).run).toEqual([
      UNIT,
    ]);
  });

  it('refuses a caller in a suite that cannot record, saying why', () => {
    expect(planRecord(['w.test.ts'], FIXTURE_SUITES, MEMBERSHIP)).toEqual({
      run: [],
      refusals: [
        'w.test.ts calls floorBreach in the workerd, which cannot record: no file system',
      ],
    });
  });

  it('refuses a caller in no suite', () => {
    expect(
      planRecord(['loose.test.ts'], FIXTURE_SUITES, MEMBERSHIP).refusals,
    ).toEqual([
      'loose.test.ts calls floorBreach and is in 0 suites, not one: none',
    ]);
  });

  it('refuses a caller in two suites', () => {
    expect(
      planRecord(['both.test.ts'], FIXTURE_SUITES, MEMBERSHIP).refusals,
    ).toEqual([
      'both.test.ts calls floorBreach and is in 2 suites, not one: unit, pacing',
    ]);
  });
});

/** A suite's files as it lists them; a list that fails is thrown, by name. */
const listedBy = (each: Suite): string[] => {
  const [command, ...args] = each.list as [string, ...string[]];
  const listed = spawnSync(command, args, { cwd: each.cwd, encoding: 'utf8' });
  const refusal = runRefusal(`${each.name}'s file list`, listed);
  if (refusal !== undefined) throw new Error(refusal);
  return suiteFiles(each, listed.stdout);
};

describe('the recorder over this repository', () => {
  it('finds every test file git has in exactly one suite it knows', () => {
    // Each suite lists its own files, so a suite added to package.json and
    // not here, or a config whose include moved, shows as a file in none.
    const membership = new Map(
      SUITES.map((each) => [each.name, listedBy(each)] as const),
    );
    const testFiles = committableFiles().filter((file) =>
      /\.(test|spec)\.ts$/.test(file),
    );
    const homeless = testFiles
      .map((file) => ({
        file,
        suites: SUITES.filter(({ name }) =>
          (membership.get(name) ?? []).includes(file),
        ).map(({ name }) => name),
      }))
      .filter(({ suites }) => suites.length !== 1);
    expect(
      searched(homeless, { of: testFiles, what: 'test files git has' }),
    ).toEqual([]);
    expect(
      floorBreach('record-floors/test-files', testFiles.length),
    ).toBeUndefined();
  }, 120_000);

  it('reads every TypeScript file git has, refuses none, and misses no file whose code names floorBreach (#448)', () => {
    const files = committableFiles([...TYPESCRIPT_FILES]).filter((path) =>
      existsSync(path),
    );
    const readings = files.map((path) => {
      const source = readFileSync(path, 'utf8');
      const sf = ts.createSourceFile(
        path,
        source,
        ts.ScriptTarget.Latest,
        true,
      );
      return {
        path,
        reading: readFloorCaller(path, source),
        // The cross-check, read from the text with literals and comments gone.
        named: /\bfloorBreach\b/.test(codeWithoutLiterals(sf)),
      };
    });
    const findings = readings.filter(
      ({ path, reading, named }) =>
        reading.refusals.length > 0 ||
        (named && !reading.calls && path !== `${FLOORS_MODULE}.ts`),
    );
    expect(
      searched(findings, { of: files, what: 'TypeScript files git has' }),
    ).toEqual([]);
    expect(
      floorBreach('record-floors/typescript-files', files.length),
    ).toBeUndefined();
    const callers = readings.filter(({ reading }) => reading.calls);
    expect(
      floorBreach('record-floors/callers', callers.length),
    ).toBeUndefined();
  });

  it('runs from no CI workflow step', () => {
    const steps = readdirSync('.github/workflows')
      .filter((file) => /\.ya?ml$/.test(file))
      .flatMap((file) => {
        const workflow = parse(
          readFileSync(`.github/workflows/${file}`, 'utf8'),
        ) as { jobs: Record<string, { steps?: { run?: unknown }[] }> };
        return Object.values(workflow.jobs).flatMap((job) =>
          (job.steps ?? []).map((step) => ({ file, run: runOf(step) })),
        );
      });
    const recording = steps.filter(({ run }) =>
      /floors:record|record-floors/.test(run),
    );
    expect(searched(recording, { of: steps, what: 'workflow steps' })).toEqual(
      [],
    );
    expect(
      floorBreach('record-floors/workflow-steps', steps.length),
    ).toBeUndefined();
  });

  it('is what npm run floors:record runs', () => {
    const scripts = (
      JSON.parse(readFileSync('package.json', 'utf8')) as {
        scripts: Record<string, string>;
      }
    ).scripts;
    expect(scripts['floors:record']).toBe('node scripts/record-floors.ts');
  });
});
