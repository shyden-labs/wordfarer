import { spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  SUITES,
  ciRefusal,
  decideRecord,
  describeMoves,
  floorsFileOf,
  floorsText,
  importsFloorBreach,
  planRecord,
  playwrightListed,
  readFloorsDir,
  runRefusal,
  suiteFiles,
  vitestListed,
  writeFloors,
  type Suite,
} from '../../scripts/record-floors';
import { floorBreach } from '../floors';
import { searched } from '../searched';
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

describe('importsFloorBreach', () => {
  it.each([
    ['a one-line import', "import { floorBreach } from '../floors';"],
    [
      'a multi-line import among others',
      "import {\n  FLOORS_DIR,\n  floorBreach,\n} from '../../tests/floors';",
    ],
  ])('reads %s as a caller', (_what, source) => {
    expect(importsFloorBreach(source)).toBe(true);
  });

  it.each([
    ['the bare name in prose', '// every floorBreach( call'],
    ['the name in a string', "const s = 'floorBreach(';"],
    ['an import from another module', "import { floorBreach } from './other';"],
    [
      'another name from the floors module',
      "import { readFloors } from '../floors';",
    ],
  ])('reads %s as no caller', (_what, source) => {
    expect(importsFloorBreach(source)).toBe(false);
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
    const web = SUITES.find(({ name }) => name === 'web gate') as Suite;
    expect(suiteFiles(web, 'test/gate.test.ts\n')).toEqual([
      'apps/web/test/gate.test.ts',
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
