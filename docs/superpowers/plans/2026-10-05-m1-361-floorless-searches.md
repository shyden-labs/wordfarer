# M1 #361: The Floorless-Searches Meta-Guard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every test that asserts absence over a population also checks that population's recorded floor in the same scope, or, for an input left empty on purpose, proves its function live with a positive control. Every search that does neither is on a burn-down list that only shrinks.

**Architecture:** `tests/floors.ts` checks a count against `tests/floors.json` for equality, and `npm run floors:record` (`scripts/record-floors.ts`) raises the figures by running every suite that holds a floor. `tests/searched.ts` holds `searched` (the population inside the assertion) and `againstControl` (the empty-input form). `tests/unit/floorless-searches.ts` reads every absence search from the parse tree, and `tests/unit/absence-text.ts` counts the same constructs from text, sharing no helper with it. `tests/unit/floorless-searches.test.ts` holds both readers' unit tests and the meta-guard over every TypeScript file git has, against `tests/unit/floorless-searches.burn-down.ts`.

**Tech Stack:** TypeScript compiler API, Vitest, Node 24 running `scripts/record-floors.ts` by type stripping, git.

**Spec:** Story #361, and the global rule of 2026-10-05, "every absence search checks a recorded floor in its own test, with no exemption labels". Reference: shyden.co.uk's floorless-searches reader, floors module and floor recorder, read (only) from that repository.

## Global Constraints

- Every commit green: each stage passes every CI step alone on a clean `npm ci`.
- No exemption label of any kind. A control is bound to what it verifies, by structure or at runtime.
- No retries. One test per case (`it.each` for tables); tests seen red; every guard mutation-verified with predictions written before the run.
- `Refs #361` in commits and the PR; commits authored as Shyden.

## Review Focus

1. **A floor is bound to its search (AC2, AC3).** A `searched` call is proved only when its scope checks `floorBreach` on the very expression its `of:` names (`.length`, `.size` or the count), spelled the same. A floor on anything else in the test proves nothing (mutation F1).
2. **The recorder sees every suite (AC1).** Wordfarer runs five suites and the root unit suite skips four of them. Each suite lists its own files; a caller in the sync Worker's suite is refused by name because workerd has no file system; a test file in no suite fails "finds every test file git has in exactly one suite it knows".
3. **Two independent readings (AC4).** The parse-tree reader and the text counts agree file by file over all 149 files, on sites and on tests; each is mutated blind and goes red (R1, R2, C1, L1, L2).

## Decisions this plan makes

- **Which forms are absence searches.** Measured over `develop` before this plan: `toEqual([])` (135 lines, more where Prettier breaks the call over lines), `toEqual({})` (4), `.size` to be 0 (1), `.some` false (1), `.every` true (4), a negated `toContain`/`toMatch` (9), plus the forms story AC2 names. A scalar `toBe(0)` is not read: the parse tree cannot tell an exit status from a count without guessing from names. Measured on 2026-10-05, 7 of the 30 scalar zeros are counts of findings; #367 makes them lists (operator decision, asked interactively).
- **Empty input (operator decision, asked interactively, "Empty input only").** 6 sites feed in empty input on purpose (`parseLog('')`, `reviewQueue({}, T0)`; first reported as 7, from a heuristic that matched over a three-line window and counted `review.test.ts:343`, whose input has content, for the line above it), so no floor can be recorded on their population. `againstControl(run, { input, control })` throws unless the input is empty and the control finds something; the reader proves it by shape (an empty literal written in place, a run reading its one argument; mutation A1), and the runtime check is mutation A2.
- **Refusal checks.** A `searched` or `againstControl` call that is the whole body of a function handed to `expect(…).toThrow(…)` searches nothing; it is counted, never a site, decided by shape (mutation K1).
- **The walk** is `committableFiles()` filtered by a regex, checked against git's own globs; a file is read once, lazily, inside the tests, because `collection-calls` refuses workspace code reached at collection.
- **The recorder** is TypeScript under `scripts/`, like the repo's other scripts, and finds callers by their `import { floorBreach } from '…/floors'`, never by the bare name.

## Acceptance criteria → tasks (#361)

| AC  | What                                                                   | Task  | Proved by                                                                                                                                                                                                                                                                                                                                                                                |
| --- | ---------------------------------------------------------------------- | ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | recorded floors, equality, a recorder that only raises and never in CI | 1     | "names a count above the figure as a population that grew", "names a count below the figure as a reader that lost units", "refuses a figure that would fall, and keeps it", "refuses one id asserted from two places", "refuses to record in CI", "runs from no CI workflow step", "finds every test file git has in exactly one suite it knows" (each seen red against a throwing stub) |
| 2   | a parse-tree reader of every form, scoped to its test or function      | 2     | "reads %s as a bare %s site, never proved", "reads a search in %s as unproved in its test", "reads a search in %s by the function name", "refuses a search %s by line, never skips it"; R1, R2, F1, K1, A1                                                                                                                                                                               |
| 3   | the meta-guard, its burn-down both ways, ceilings, no exemption        | 3     | "finds every scope holding exactly the unproved searches listed", "only shrinks the burn-down list"; B1, B2                                                                                                                                                                                                                                                                              |
| 4   | controls (a) to (e)                                                    | 2, 3  | (a) every verdict wraps `searched`; (b) floors `floorless-searches/sites`, `/files`, `/tests`; (c) "reads as many absence sites in each file as its text writes, over every file git has", "reads as many tests in each file as its text writes"; (d) refusals by line; (e) "%s: %s"; W1, C1, L1, L2                                                                                     |
| 5   | mutations, predictions first, anchors asserted                         | 3     | the Mutations section: 12 of 12 caught, the total 4,858 every run                                                                                                                                                                                                                                                                                                                        |
| 6   | measured and quoted                                                    | 3     | the PR: 171 sites, 149 files, 1,161 tests, 155 unproved in 141 scopes; the known positive below                                                                                                                                                                                                                                                                                          |
| 7   | conversions filed, at most 13 points each, scored against closed work  | after | the Finishing section                                                                                                                                                                                                                                                                                                                                                                    |

**The known positive (AC6),** checked before the count was trusted: a per-file `git grep` of the empty forms against the reader. Every difference is explained: the reader finds one more in three files where Prettier breaks `toEqual(` over lines (`run.test.ts:159`, `supply-chain.test.ts:377`, `verify-dev.test.ts:43`), grep's extras in `core-determinism-lint.test.ts` are `.not.toEqual([])` (presence), and its extras in this story's own files are prose and fixture strings.

## How this plan was reviewed

Every code block below is generated from this branch's stage commits by `gen.py`, and `check.py` re-reads each one against its source (trailing whitespace aside), checks that every test title the plan cites exists, that every mutation id it cites is defined, that every repository path it names exists, and that no placeholder is left.

| Pass | Findings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | 2026-10-05 03:53. Mechanical: 22 blocks match their stage commits, 16 cited titles exist, 12 mutation ids defined. Two findings: the Spec line named shyden.co.uk's files as backticked paths, which read as paths in this repository and do not exist here; reworded.                                                                                                                                                                                                                                                                                                        |
| 2    | 2026-10-05 03:53. Mechanical checks clean; the code is executed by each stage's gate, since every block is a gated commit. Read in full as an adversary, three findings, all in the mutation table: titles were split at `>`, which titles holding `(x) => x > 1` contain; a title broken over lines was cut at its first line; B2's added line repeats an existing one, so the line diff showed "adds ``". `tables.py` now keeps titles whole, joins continuation lines, shows what an edit adds, and gives each row its count (R1's 108 equals its run's own "108 failed"). |
| 3    | 2026-10-05 03:54. Mechanical checks clean. Read in full, two findings in the head: AC1 cited mutation A2, which mutates `againstControl`'s runtime check, not the recorder, so AC1 claimed a mutation proof it does not have (its proof is its tests, each seen red); A1 and A2 now sit with the empty-input decision they prove. The 135 `toEqual([])` lines were measured on `develop` before this plan, which the text now says.                                                                                                                                           |
| 4    | 2026-10-05 03:54. Mechanical checks clean. Read in full, one finding: the empty-input count was 7, from a heuristic matching over a three-line window, which counted `review.test.ts:343` (input with content) for the line above it. The measured count is 6, as the conversion stories already list; the plan says so, and the operator was told.                                                                                                                                                                                                                           |
| 5    | 2026-10-05 03:55. Mechanical checks clean; every figure re-read against its measurement (171 sites, 149 files, 1,161 tests, 155 unproved in 141 scopes, 6 empty-input sites, 7 count checks, 89 points). No findings: approved.                                                                                                                                                                                                                                                                                                                                               |

---

### Task 1: Recorded floors, their recorder, and the searched wrapper

**Files:**

- Create: `tests/floors.ts`, `tests/floors.json`, `scripts/record-floors.ts`, `tests/searched.ts`, `tests/unit/floors.test.ts`, `tests/unit/record-floors.test.ts`, `tests/unit/searched.test.ts`
- Modify: `package.json`, `tests/unit/tracked-files.ts`

**Interfaces:**

- Produces: `floorBreach(id, actual, options?)`, `readFloors`, `FLOORS_FILE`, `RECORD_ENV`; `npm run floors:record` (`SUITES`, `planRecord`, `decideRecord`, `describeMoves`, `floorsText`, `ciRefusal`, `runRefusal`, `importsFloorBreach`, `vitestListed`, `playwrightListed`, `suiteFiles`); `searched(findings, { of, what })`; `committableFiles()`.

- [ ] **Step 1: Write the failing tests for searched**

`tests/unit/searched.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { floorBreach } from '../floors';
import { searched } from '../searched';

/**
 * `searched` puts the population a finding list was drawn from inside the
 * assertion itself (#361): `expect(findings).toEqual([])` is green both when
 * a guard read everything and found nothing and when it read nothing at all.
 * Each search here checks its population's floor like any other.
 */

describe('searched', () => {
  it('returns the findings it was given, untouched', () => {
    const findings = ['a finding'];
    const units = ['a unit'];
    expect(searched(findings, { of: units, what: 'units' })).toBe(findings);
    expect(floorBreach('searched/untouched', units.length)).toBeUndefined();
  });

  it('passes an empty finding list over a live population', () => {
    const units = ['a unit', 'another'];
    expect(searched([], { of: units, what: 'units' })).toEqual([]);
    expect(floorBreach('searched/live', units.length)).toBeUndefined();
  });

  it('passes a count of at least one', () => {
    const count = 3;
    expect(searched([], { of: count, what: 'units' })).toEqual([]);
    expect(floorBreach('searched/count', count)).toBeUndefined();
  });

  // Members that are values a guard could be hunting, so they count.
  it.each([
    ['zero', 0],
    ['false', false],
    ['a non-blank string', 'x'],
    ['a list holding something', [0]],
    ['an object holding a key', { k: undefined }],
    ['a set holding something', new Set([0])],
    ['a map holding something', new Map([[0, 0]])],
  ])('counts %s as a live member', (_what, member) => {
    const members = [member];
    expect(searched([], { of: members, what: 'units' })).toEqual([]);
    expect(floorBreach('searched/member', members.length)).toBeUndefined();
  });

  it('refuses an empty population, naming it', () => {
    expect(() => searched([], { of: [], what: 'built pages' })).toThrow(
      /searched no built pages/,
    );
  });

  // Six blank headers are six entries and no content (#112 in shyden.co.uk):
  // a population of empties is as dead as an empty one.
  it.each([
    ['a blank string', '  '],
    ['an empty string', ''],
    ['an empty list', []],
    ['an empty object', {}],
    ['an empty set', new Set()],
    ['an empty map', new Map()],
    ['null', null],
    ['undefined', undefined],
  ])('refuses a population whose only member is %s', (_what, member) => {
    expect(() => searched([], { of: [member], what: 'rows' })).toThrow(
      /searched no rows/,
    );
  });

  it.each([
    ['zero', 0],
    ['a negative count', -1],
    ['a fraction', 1.5],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
  ])('refuses %s as a count', (_what, count) => {
    expect(() => searched([], { of: count, what: 'rows' })).toThrow(
      /searched no rows/,
    );
  });
});
```

- [ ] **Step 2: Write the failing tests for floorBreach**

`tests/unit/floors.test.ts`:

```ts
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLOORS_FILE, RECORD_ENV, floorBreach, readFloors } from '../floors';
import type { Observation } from '../../scripts/record-floors';

/**
 * `floorBreach` judges a count against its recorded figure for EQUALITY, so
 * growth fails as well as loss (#361), and in record mode writes what it saw.
 */
const FLOORS = { 'guard/units': 5 };
const judge = (actual: number) =>
  floorBreach('guard/units', actual, { floors: FLOORS, record: null });

describe('floorBreach, judging', () => {
  it('says nothing when the count equals the recorded figure', () => {
    expect(judge(5)).toBeUndefined();
  });

  it('names a count below the figure as a reader that lost units', () => {
    expect(judge(3)).toBe(
      'guard/units: read 3, recorded 5. The reader lost 2, or the corpus ' +
        'shrank: if it shrank, lower the figure in tests/floors.json by hand ' +
        'and say why in the commit.',
    );
  });

  it('names a count above the figure as a population that grew', () => {
    expect(judge(8)).toBe(
      'guard/units: read 8, recorded 5. The population grew by 3: run npm ' +
        'run floors:record, read what it moved, and commit tests/floors.json.',
    );
  });

  it('names an id that is not recorded', () => {
    expect(
      floorBreach('guard/other', 1, { floors: FLOORS, record: null }),
    ).toBe(
      'guard/other is not recorded in tests/floors.json: run npm run floors:record',
    );
  });

  it.each([
    ['a fraction', 1.5],
    ['a negative', -1],
    ['NaN', Number.NaN],
    ['infinity', Number.POSITIVE_INFINITY],
  ])('refuses %s as not a count', (_what, actual) => {
    expect(judge(actual)).toBe(`guard/units: ${String(actual)} is not a count`);
  });

  it('reads the recorded figures from the repository root, whatever the working directory', () => {
    // The web gate's suite runs from apps/web, where a relative path to the
    // floors file names nothing.
    const fromRoot = readFloors();
    const was = process.cwd();
    process.chdir('apps/web');
    try {
      expect(readFloors()).toEqual(fromRoot);
    } finally {
      process.chdir(was);
    }
    expect(FLOORS_FILE).toBe('tests/floors.json');
  });
});

describe('floorBreach, recording', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const recordFile = () =>
    join(mkdtempSync(join(tmpdir(), 'floors-test-')), 'seen.jsonl');
  const lines = (file: string) =>
    readFileSync(file, 'utf8')
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as Observation);

  it('writes the id, the count and the calling file and line, and says nothing', () => {
    const file = recordFile();
    expect(floorBreach('guard/units', 7, { record: file })).toBeUndefined();
    const seen = lines(file);
    expect(seen.map(({ id, actual }) => ({ id, actual }))).toEqual([
      { id: 'guard/units', actual: 7 },
    ]);
    expect(seen[0]?.site).toMatch(/^tests\/unit\/floors\.test\.ts:\d+$/);
  });

  it('records when the environment names a file and no option overrides it', () => {
    const file = recordFile();
    vi.stubEnv(RECORD_ENV, file);
    expect(floorBreach('guard/units', 2)).toBeUndefined();
    expect(lines(file)).toEqual([expect.objectContaining({ actual: 2 })]);
  });

  it('judges when an option says so, whatever the environment says', () => {
    const file = recordFile();
    vi.stubEnv(RECORD_ENV, file);
    expect(judge(4)).toMatch(/read 4, recorded 5/);
  });

  it('refuses a count that is not one in record mode too, writing nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'floors-test-'));
    const file = join(dir, 'seen.jsonl');
    expect(floorBreach('guard/units', -2, { record: file })).toBe(
      'guard/units: -2 is not a count',
    );
    expect(() => readFileSync(file)).toThrow(/ENOENT/);
  });
});
```

- [ ] **Step 3: Write the failing tests for the recorder**

`tests/unit/record-floors.test.ts`:

```ts
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import {
  SUITES,
  ciRefusal,
  decideRecord,
  describeMoves,
  floorsText,
  importsFloorBreach,
  planRecord,
  playwrightListed,
  runRefusal,
  suiteFiles,
  vitestListed,
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
          'corpus really shrank, lower it in tests/floors.json by hand and say ' +
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
        'tests/floors.json with the floor that used it, or run every suite',
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
      "import {\n  FLOORS_FILE,\n  floorBreach,\n} from '../../tests/floors';",
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
```

- [ ] **Step 4: Run it red**

Run: `npx vitest run tests/unit/searched.test.ts tests/unit/floors.test.ts tests/unit/record-floors.test.ts`

Seen red against stubs of `tests/searched.ts`, `tests/floors.ts` and `scripts/record-floors.ts` whose every function throws "not implemented": 63 of 64 failed, each on its own assertion. The one that passed, "is what npm run floors:record runs", reads `package.json`, whose script line was written before the test. The implementation was also written before these tests, out of TDD order; the stub run is what recovers the red step. On the first green run every failure was a floor not yet recorded. The first record run found two defects in the recorder, fixed in this stage: `git grep` exits 1 for no match and does not search untracked files (now `--untracked`, exit 1 read as no callers), and a caller was any file spelling `floorBreach(`, the recorder's own text included (now a file that imports `floorBreach` from the floors module, `importsFloorBreach`). `record-floors/test-files` first counted tracked files and read 69, so committing the stage's own three test files would have breached it; it counts `committableFiles()` instead.

- [ ] **Step 5: Write searched**

`tests/searched.ts`:

```ts
/**
 * The population a finding list was drawn from, proved live (#361).
 *
 * `expect(findings).toEqual([])` is green in two different worlds: the guard
 * ran and found nothing, and the guard was handed nothing to run over.
 *
 *     expect(searched(findings, { of: files, what: 'test files' })).toEqual([]);
 *
 * The population sits INSIDE the assertion's own expression, so a call site
 * cannot forget a control it has nowhere to omit. It returns the findings
 * untouched, so the verdict, and the runner's diff of the offending entries,
 * stays with the caller's own `expect`.
 *
 * Hand it the population ITSELF where there is one: a count is taken on
 * trust, while an array's members are content-checked, because six blank
 * headers are six entries and no content.
 *
 * Refusing an EMPTY population catches a reader blind to everything; a reader
 * blind to PART of its population still passes while one unit is read. So
 * every search also checks its population's recorded floor in the same test
 * (`floorBreach` in `tests/floors.ts`), and `floorless-searches.test.ts`
 * holds that.
 */
export function searched<T>(
  findings: readonly T[],
  population: { of: number | readonly unknown[]; what: string },
): readonly T[] {
  const { of, what } = population;
  const live =
    typeof of === 'number'
      ? Number.isInteger(of)
        ? of
        : 0
      : of.filter(isSubstantive).length;
  if (live <= 0)
    throw new Error(
      `searched no ${what}: an absence assertion over an empty population is ` +
        'green whatever the guard does, and counting entries is not counting ' +
        'content.',
    );
  return findings;
}

/**
 * A member a guard could be searching: not blank, not an empty container,
 * not null. `0` and `false` ARE values, and a guard hunting a zero width or
 * an unset flag would be reading them.
 */
function isSubstantive(member: unknown): boolean {
  if (member === null || member === undefined) return false;
  if (typeof member === 'string') return member.trim() !== '';
  if (Array.isArray(member)) return member.length > 0;
  if (member instanceof Map || member instanceof Set) return member.size > 0;
  if (typeof member === 'object') return Object.keys(member).length > 0;
  return true;
}
```

- [ ] **Step 6: Write floorBreach**

`tests/floors.ts`:

```ts
/**
 * Recorded liveness floors, checked for equality (#361).
 *
 * A liveness floor proves a guard read its population: a guard judging
 * nothing because its reader went blind must not look like a clean suite.
 * Written as a literal `toBeGreaterThan(measured - 1)`, a floor is tight only
 * on the day it is measured, because growth never fails it: shyden.co.uk set
 * one to `> 420` against a real 421 and read 424 an hour after it merged, so
 * its reader could have lost three units in silence.
 *
 * So each floor is a figure recorded in `tests/floors.json` and checked for
 * EQUALITY. Fewer than recorded is a reader that lost units, or a corpus that
 * really shrank, which only a person can tell apart, so the figure is lowered
 * by hand with the reason in the commit. More than recorded is a population
 * that grew, and `npm run floors:record` raises it. Neither direction moves
 * on its own, so every floor is exact on every commit.
 *
 * Runner-neutral: it imports no runner and returns the breach as text for
 * the caller's own `expect`, placed AFTER the guard's verdict so a population
 * that grew never hides a finding:
 *
 *     expect(searched(findings, { of: files, what: 'test files' })).toEqual([]);
 *     expect(floorBreach('one-test-per-case/files', files.length)).toBeUndefined();
 *
 * The floor counts the very population the search names in `of:`;
 * `floorless-searches.test.ts` holds that.
 */
import { appendFileSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FLOORS_FILE, RECORD_ENV } from '../scripts/record-floors';

export { FLOORS_FILE, RECORD_ENV };

export type Floors = Readonly<Record<string, number>>;

/**
 * The repository root, from this file's own place rather than the working
 * directory: the web gate's suite runs from `apps/web`, where a relative
 * `tests/floors.json` names nothing.
 */
const ROOT = fileURLToPath(new URL('..', import.meta.url));

export const readFloors = (file: string = join(ROOT, FLOORS_FILE)): Floors =>
  JSON.parse(readFileSync(file, 'utf8')) as Floors;

const THIS_FILE = relative(ROOT, fileURLToPath(import.meta.url));

/**
 * The repository-relative `file:line` that called the check: the first stack
 * frame outside this file and outside node_modules. The recorder tells two
 * call sites of one id apart by it.
 */
const callSite = (stack: string): string => {
  for (const line of stack.split('\n').slice(1)) {
    // V8 writes `at name (where:line:column)` or `at where:line:column`, and
    // `where` is a path or a file URL.
    const frame =
      /\((.+):(\d+):\d+\)$/.exec(line) ?? /^\s*at (.+):(\d+):\d+$/.exec(line);
    if (!frame?.[1] || !frame[2]) continue;
    const path = frame[1].startsWith('file:')
      ? fileURLToPath(frame[1])
      : frame[1];
    const file = relative(ROOT, path);
    if (file !== THIS_FILE && !file.includes('node_modules'))
      return `${file}:${frame[2]}`;
  }
  // Refused, never guessed.
  throw new Error(`cannot tell which file called floorBreach:\n${stack}`);
};

export interface FloorOptions {
  /** The recorded figures; read from `FLOORS_FILE` when judging, if absent. */
  readonly floors?: Floors;
  /**
   * Where to record, `null` to judge. Absent means the environment decides
   * (`RECORD_ENV`): a test of this module passes `null`, so a record run
   * never mistakes its fixtures for real floors.
   */
  readonly record?: string | null;
}

/**
 * Nothing when `actual` equals the figure recorded for `id`; otherwise the
 * breach, naming the id, both numbers and what to do. In record mode it
 * appends `{ id, actual, site }` and says nothing, so one run sees every
 * floor. Something that is not a count is refused in both modes.
 */
export function floorBreach(
  id: string,
  actual: number,
  options: FloorOptions = {},
): string | undefined {
  if (!Number.isInteger(actual) || actual < 0)
    return `${id}: ${String(actual)} is not a count`;
  const record =
    options.record === undefined
      ? (process.env[RECORD_ENV] ?? null)
      : options.record;
  if (record !== null) {
    const site = callSite(new Error().stack ?? '');
    appendFileSync(record, JSON.stringify({ id, actual, site }) + '\n');
    return undefined;
  }
  const measured = (options.floors ?? readFloors())[id];
  if (measured === undefined)
    return `${id} is not recorded in ${FLOORS_FILE}: run npm run floors:record`;
  if (actual < measured)
    return (
      `${id}: read ${String(actual)}, recorded ${String(measured)}. The ` +
      `reader lost ${String(measured - actual)}, or the corpus shrank: if it ` +
      `shrank, lower the figure in ${FLOORS_FILE} by hand and say why in the ` +
      `commit.`
    );
  if (actual > measured)
    return (
      `${id}: read ${String(actual)}, recorded ${String(measured)}. The ` +
      `population grew by ${String(actual - measured)}: run npm run ` +
      `floors:record, read what it moved, and commit ${FLOORS_FILE}.`
    );
  return undefined;
}
```

- [ ] **Step 7: Write the recorder**

`scripts/record-floors.ts`:

```ts
/**
 * Record the guards' liveness floors (#361): `npm run floors:record`.
 *
 * Every `floorBreach` call (`tests/floors.ts`) judges a count against the
 * figure recorded in `tests/floors.json`. Run with `FLOORS_RECORD` set, it
 * writes the count it saw instead. This script runs each suite that holds a
 * call that way, judges every count together and raises `tests/floors.json`
 * to match. It checks EVERYTHING before writing anything, and refuses the
 * whole record when:
 *
 * - a figure would FALL. A falling count is what a blind reader looks like,
 *   and so is a corpus that really shrank; only a person can tell the two
 *   apart, so a fall is a hand edit with the reason in the commit;
 * - a recorded id was asserted by no test, so the file names a floor that no
 *   longer exists (or a suite that did not reach it);
 * - one id was asserted from two places, or read two values: two guards
 *   sharing a figure would let either go blind behind the other;
 * - a file calling `floorBreach` belongs to no suite the recorder can run
 *   (the sync Worker's suite runs inside workerd, which has no file system);
 * - any suite failed or did not start.
 *
 * Wordfarer runs five suites, and the root unit suite skips four of them
 * (pacing, the web gate, the sync Worker, the engines), so each suite is
 * asked for its own file list rather than the recorder copying their globs.
 *
 * CI never records: a run that can rewrite the figure it checks against
 * asserts nothing. Imports are Node's own.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, posix, relative, sep } from 'node:path';

/** The recorded figures, relative to the repository root. */
export const FLOORS_FILE = 'tests/floors.json';

/** Set to a file for each `floorBreach` call to append what it saw to. */
export const RECORD_ENV = 'FLOORS_RECORD';

export interface Observation {
  readonly id: string;
  readonly actual: number;
  readonly site: string;
}

/** One way the repository runs tests, and how to ask it for its files. */
export interface Suite {
  readonly name: string;
  /** Repository-relative directory the suite runs from. */
  readonly cwd: string;
  /** The command that lists the suite's files. */
  readonly list: readonly string[];
  /** Reads `list`'s output as paths relative to `cwd`. */
  readonly files: (stdout: string) => string[];
  /** The command that runs the suite, or why it cannot record. */
  readonly run: readonly string[] | { readonly unrecordable: string };
}

/** `vitest list --filesOnly`: one path per line, relative to its root. */
export const vitestListed = (stdout: string): string[] =>
  stdout
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '');

interface PlaywrightList {
  readonly config: { readonly rootDir: string };
  readonly suites: readonly { readonly file: string }[];
}

/**
 * `playwright test --list --reporter=json`: files relative to its test
 * directory, which `rootDir` names absolutely. `cwd` is where it ran.
 */
export const playwrightListed =
  (cwd: string) =>
  (stdout: string): string[] => {
    const { config, suites } = JSON.parse(stdout) as PlaywrightList;
    return suites.map(({ file }) =>
      relative(cwd, join(config.rootDir, file)).split(sep).join(posix.sep),
    );
  };

const VITEST_LIST = ['npx', 'vitest', 'list', '--filesOnly'];

/** Every suite `package.json` runs, in the order a record runs them. */
export const SUITES: readonly Suite[] = [
  {
    name: 'unit suite',
    cwd: '.',
    list: VITEST_LIST,
    files: vitestListed,
    run: ['npx', 'vitest', 'run'],
  },
  {
    name: 'pacing suite',
    cwd: '.',
    list: [...VITEST_LIST, '-c', 'vitest.pacing.config.ts'],
    files: vitestListed,
    run: ['npm', 'run', 'test:pacing'],
  },
  {
    name: 'web gate',
    cwd: 'apps/web',
    list: [...VITEST_LIST, '-c', 'vitest.gate.config.ts'],
    files: vitestListed,
    // Its `test` script builds first: the gate serves the built ./dist.
    run: ['npm', 'run', 'test'],
  },
  {
    name: 'sync Worker suite',
    cwd: 'apps/sync-worker',
    list: VITEST_LIST,
    files: vitestListed,
    run: {
      unrecordable:
        'it runs inside workerd, which has no file system for floorBreach ' +
        'to record to',
    },
  },
  {
    name: 'engines suite',
    cwd: '.',
    list: [
      'npx',
      'playwright',
      'test',
      '-c',
      'playwright.engines.config.ts',
      '--list',
      '--reporter=json',
    ],
    files: (stdout) => playwrightListed(process.cwd())(stdout),
    run: ['npm', 'run', 'test:engines'],
  },
];

/** A suite's files, repository-relative. */
export const suiteFiles = (suite: Suite, stdout: string): string[] =>
  suite.files(stdout).map((file) => posix.join(suite.cwd, file));

/**
 * The suites to run for `callers` (files that call `floorBreach`), in
 * `suites` order, and every caller no runnable suite holds.
 */
export function planRecord(
  callers: readonly string[],
  suites: readonly Suite[],
  membership: ReadonlyMap<string, readonly string[]>,
): { run: Suite[]; refusals: string[] } {
  const needed = new Set<Suite>();
  const refusals: string[] = [];
  for (const caller of callers) {
    const holders = suites.filter((suite) =>
      (membership.get(suite.name) ?? []).includes(caller),
    );
    if (holders.length !== 1) {
      refusals.push(
        `${caller} calls floorBreach and is in ${String(holders.length)} ` +
          `suites, not one: ${holders.map(({ name }) => name).join(', ') || 'none'}`,
      );
      continue;
    }
    const [suite] = holders as [Suite];
    if ('unrecordable' in suite.run)
      refusals.push(
        `${caller} calls floorBreach in the ${suite.name}, which cannot ` +
          `record: ${suite.run.unrecordable}`,
      );
    else needed.add(suite);
  }
  return { run: suites.filter((suite) => needed.has(suite)), refusals };
}

/** Why a suite's run cannot be trusted, or nothing. */
export const runRefusal = (
  name: string,
  { status, error }: { status: number | null; error?: Error },
): string | undefined =>
  error !== undefined
    ? `the ${name} did not start: ${error.message}`
    : status === 0
      ? undefined
      : `the ${name} failed (exit ${String(status)}): nothing recorded`;

/** Why this environment must not record, or nothing. */
export const ciRefusal = (
  environment: Readonly<Record<string, string | undefined>>,
): string | undefined =>
  environment['CI'] === undefined || environment['CI'] === ''
    ? undefined
    : 'CI never records floors: run npm run floors:record locally';

/**
 * The next figures, and every reason not to write them. The caller writes
 * `next` only when `refusals` is empty.
 */
export function decideRecord(
  recorded: Readonly<Record<string, number>>,
  seen: readonly Observation[],
): { next: Record<string, number>; refusals: string[] } {
  const byId = new Map<string, Observation[]>();
  for (const observation of seen)
    byId.set(observation.id, [
      ...(byId.get(observation.id) ?? []),
      observation,
    ]);

  const next: Record<string, number> = { ...recorded };
  const refusals: string[] = [];
  for (const [id, observations] of byId) {
    const sites = [...new Set(observations.map(({ site }) => site))];
    const values = [...new Set(observations.map(({ actual }) => actual))];
    if (sites.length > 1) {
      refusals.push(`${id} is asserted from two places: ${sites.join(', ')}`);
      continue;
    }
    if (values.length > 1) {
      refusals.push(`${id} read two different values: ${values.join(', ')}`);
      continue;
    }
    const [actual] = values as [number];
    const measured = recorded[id];
    if (measured !== undefined && actual < measured) {
      refusals.push(
        `${id} would fall from ${String(measured)} to ${String(actual)}: a ` +
          `blind reader looks like this. If the corpus really shrank, lower ` +
          `it in ${FLOORS_FILE} by hand and say why in the commit.`,
      );
      continue;
    }
    next[id] = actual;
  }
  for (const id of Object.keys(recorded))
    if (!byId.has(id))
      refusals.push(
        `${id} is recorded but no test asserted it: remove it from ` +
          `${FLOORS_FILE} with the floor that used it, or run every suite`,
      );
  return { next, refusals };
}

/**
 * One line per figure that moved, largest move first: `id: 100 -> 125 (+25)`
 * or `id: new, 3`. Printed because a raise is accepted on its direction
 * alone: a change that adds five units while its reader loses three records
 * +2, so each delta is read against the diff that caused it.
 */
export const describeMoves = (
  recorded: Readonly<Record<string, number>>,
  next: Readonly<Record<string, number>>,
): string[] =>
  Object.keys(next)
    .filter((id) => next[id] !== recorded[id])
    .map((id) => ({
      id,
      was: recorded[id],
      now: next[id] as number,
    }))
    .sort(
      (a, b) =>
        b.now - (b.was ?? 0) - (a.now - (a.was ?? 0)) || (a.id < b.id ? -1 : 1),
    )
    .map(({ id, was, now }) =>
      was === undefined
        ? `${id}: new, ${String(now)}`
        : `${id}: ${String(was)} -> ${String(now)} (+${String(now - was)})`,
    );

/** The file's text: ids sorted, two-space indented, a final newline (prettier's own form). */
export const floorsText = (floors: Readonly<Record<string, number>>): string =>
  JSON.stringify(
    Object.fromEntries(
      Object.entries(floors).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
    ),
    null,
    2,
  ) + '\n';

/** What a record run wrote, one observation per line; nothing if no file. */
const observationsIn = (file: string): Observation[] =>
  existsSync(file)
    ? readFileSync(file, 'utf8')
        .split('\n')
        .filter((line) => line !== '')
        .map((line) => JSON.parse(line) as Observation)
    : [];

/**
 * Whether `source` imports `floorBreach` from the floors module: the
 * construct that makes a file a caller. Its bare name is no evidence, since
 * this file spells it in prose and in the search below.
 */
export const importsFloorBreach = (source: string): boolean =>
  /import\s*\{[^}]*\bfloorBreach\b[^}]*\}\s*from\s*['"][^'"]*\/floors['"]/.test(
    source,
  );

/**
 * TypeScript files git tracks, or would at the next `git add -A`, whose text
 * calls `floorBreach`, but not its home. `git grep` exits 1 for no match.
 */
const floorCallers = (): string[] => {
  const found = spawnSync(
    'git',
    ['grep', '-l', '--untracked', '-F', 'floorBreach(', '--', '*.ts'],
    { encoding: 'utf8' },
  );
  if (found.status === 1 && found.error === undefined) return [];
  const refusal = runRefusal('search for floorBreach callers', found);
  if (refusal !== undefined) die(refusal);
  return found.stdout
    .split('\n')
    .filter(
      (file) => file !== '' && importsFloorBreach(readFileSync(file, 'utf8')),
    );
};

const die = (message: string): never => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

const main = (): void => {
  const ci = ciRefusal(process.env);
  if (ci !== undefined) die(ci);

  const recorded = existsSync(FLOORS_FILE)
    ? (JSON.parse(readFileSync(FLOORS_FILE, 'utf8')) as Record<string, number>)
    : {};

  const membership = new Map<string, string[]>();
  for (const suite of SUITES) {
    const [command, ...args] = suite.list as [string, ...string[]];
    const listed = spawnSync(command, args, {
      cwd: suite.cwd,
      encoding: 'utf8',
    });
    const refusal = runRefusal(`${suite.name}'s file list`, listed);
    if (refusal !== undefined) die(refusal);
    membership.set(suite.name, suiteFiles(suite, listed.stdout));
  }
  const plan = planRecord(floorCallers(), SUITES, membership);
  if (plan.refusals.length > 0)
    die(`nothing recorded:\n  ${plan.refusals.join('\n  ')}`);

  // Judged after the loop: `die` exits at once and would leak the directory.
  const dir = mkdtempSync(join(tmpdir(), 'floors-record-'));
  let refusal: string | undefined;
  let seen: Observation[] = [];
  try {
    for (const suite of plan.run) {
      if ('unrecordable' in suite.run) continue;
      const record = join(dir, `${suite.name.replace(/[^a-z]+/gi, '-')}.jsonl`);
      const [command, ...args] = suite.run as [string, ...string[]];
      console.log(`Recording the ${suite.name}: ${suite.run.join(' ')}`);
      refusal = runRefusal(
        suite.name,
        spawnSync(command, args, {
          cwd: suite.cwd,
          stdio: 'inherit',
          env: { ...process.env, [RECORD_ENV]: record },
        }),
      );
      if (refusal !== undefined) break;
      seen = [...seen, ...observationsIn(record)];
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  if (refusal !== undefined) die(refusal);

  const { next, refusals } = decideRecord(recorded, seen);
  if (refusals.length > 0) die(`nothing recorded:\n  ${refusals.join('\n  ')}`);

  const moves = describeMoves(recorded, next);
  writeFileSync(FLOORS_FILE, floorsText(next));
  console.log(
    moves.length === 0
      ? `${FLOORS_FILE}: every floor already matches (${String(seen.length)} read)`
      : [
          `${FLOORS_FILE}: ${String(moves.length)} floor(s) moved:`,
          ...moves.map((move) => `  ${move}`),
          'Read each one against your diff: a raise smaller than the units you',
          'added is a reader that lost some. Put these lines in the commit.',
        ].join('\n'),
  );
};

if (import.meta.main) main();
```

- [ ] **Step 8: Add committableFiles**

`tests/unit/tracked-files.ts`, as T1 changes it:

```diff
diff --git a/tests/unit/tracked-files.ts b/tests/unit/tracked-files.ts
index 4e16601..2098dc8 100644
--- a/tests/unit/tracked-files.ts
+++ b/tests/unit/tracked-files.ts
@@ -9,3 +9,17 @@ export const trackedFiles = (): string[] =>
   execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' })
     .split('\0')
     .filter((path) => path !== '');
+
+/**
+ * Every path git tracks or would track at the next `git add -A`: tracked,
+ * plus untracked and not ignored. A test file written before its `git add`
+ * is in it, so a count over it does not move when the file is committed.
+ */
+export const committableFiles = (): string[] =>
+  execFileSync(
+    'git',
+    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
+    { encoding: 'utf8' },
+  )
+    .split('\0')
+    .filter((path) => path !== '');
```

- [ ] **Step 9: Add the floors:record script**

`package.json`, as T1 changes it:

```diff
diff --git a/package.json b/package.json
index 465b8b9..9d9b927 100644
--- a/package.json
+++ b/package.json
@@ -13,6 +13,7 @@
   "scripts": {
     "postinstall": "npm run types --workspace @wordfarer/sync-worker --workspace @wordfarer/web",
     "test:unit": "vitest run",
+    "floors:record": "node scripts/record-floors.ts",
     "test:worker": "npm run test --workspace @wordfarer/sync-worker --workspace @wordfarer/web",
     "test:pacing": "vitest run -c vitest.pacing.config.ts",
     "test:engines": "playwright test -c playwright.engines.config.ts",
```

- [ ] **Step 10: Record the floors with npm run floors:record**

`tests/floors.json`:

```json
{
  "record-floors/test-files": 72,
  "record-floors/workflow-steps": 30,
  "searched/count": 3,
  "searched/live": 2,
  "searched/member": 1,
  "searched/untouched": 1
}
```

- [ ] **Step 11: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/searched.test.ts tests/unit/floors.test.ts tests/unit/record-floors.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `Recorded floors with their recorder, and the searched wrapper (Refs #361)`.

### Task 2: The absence-search reader, its text cross-check, and againstControl

**Files:**

- Create: `tests/unit/floorless-searches.ts`, `tests/unit/absence-text.ts`, `tests/unit/floorless-searches.test.ts`
- Modify: `tests/searched.ts`, `tests/unit/searched.test.ts`, `tests/unit/source-text.ts`, `tests/unit/one-test-per-case.ts`, `tests/floors.json`

**Interfaces:**

- Consumes: Task 1. Produces: `searchSitesIn(sf)` returning `SearchReading` (`sites`, `tests`, `refusalChecks`, `unplaced`, `refused`); `absencesWritten`, `testsWritten`, `callOpening`; `codeWithoutLiterals(sf)`; `againstControl(run, { input, control })`; `kindOf`, `callbackOf`, `titleOf`, `chainRoot` exported from `one-test-per-case.ts`.

- [ ] **Step 1: Write the failing tests for the reader and the text counts**

`tests/unit/floorless-searches.test.ts`:

```ts
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { absencesWritten, callOpening, testsWritten } from './absence-text';
import {
  searchSitesIn,
  type Form,
  type SearchReading,
} from './floorless-searches';
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
```

- [ ] **Step 2: Write the failing tests for againstControl**

`tests/unit/searched.test.ts`, as T2 changes it:

```diff
diff --git a/tests/unit/searched.test.ts b/tests/unit/searched.test.ts
index b286722..47b7387 100644
--- a/tests/unit/searched.test.ts
+++ b/tests/unit/searched.test.ts
@@ -1,6 +1,6 @@
 import { describe, expect, it } from 'vitest';
 import { floorBreach } from '../floors';
-import { searched } from '../searched';
+import { againstControl, searched } from '../searched';

 /**
  * `searched` puts the population a finding list was drawn from inside the
@@ -79,3 +79,44 @@ describe('searched', () => {
     );
   });
 });
+
+/** Splits on commas: nothing in, nothing out, and one word per field. */
+const fields = (line: string): string[] =>
+  line.split(',').filter((field) => field !== '');
+
+describe('againstControl', () => {
+  it('returns what the run finds in the empty input', () => {
+    expect(againstControl(fields, { input: '', control: 'a,b' })).toEqual([]);
+  });
+
+  it('runs the control first, then the input, and returns the input’s result', () => {
+    const seen: string[] = [];
+    const run = (given: string): string[] => {
+      seen.push(given);
+      return fields(given);
+    };
+    expect(againstControl(run, { input: '', control: 'x' })).toEqual([]);
+    expect(seen).toEqual(['x', '']);
+  });
+
+  it('refuses an input with content: a population checks a floor instead', () => {
+    expect(() =>
+      againstControl(fields, { input: 'a', control: 'a,b' }),
+    ).toThrow(/againstControl is for an empty input/);
+  });
+
+  it('refuses a control that finds nothing: a dead run passes otherwise', () => {
+    expect(() => againstControl(fields, { input: '', control: ',' })).toThrow(
+      /the control found nothing/,
+    );
+  });
+
+  it('leaves a run that ignores its input to fail the absence assertion', () => {
+    // Its control finds something, so its input finds the same thing, and
+    // the `toEqual([])` a real use writes would fail.
+    const ignoring = (): string[] => ['always'];
+    expect(againstControl(ignoring, { input: '', control: 'a' })).toEqual([
+      'always',
+    ]);
+  });
+});
```

- [ ] **Step 3: Run it red**

Run: `npx vitest run tests/unit/floorless-searches.test.ts tests/unit/searched.test.ts tests/unit/one-test-per-case.test.ts`

Seen red against stubs of the reader, the text counts and `againstControl` that throw "not implemented": all 118 new tests failed. The 24 that passed are Task 1's `searched` tests, since the stub kept the real `searched`. Two failed on the first green run, both in the tests: a bare form broken over lines was reported at its matcher's line, changed to the line of its `expect(` (the line a person opens), and one expected index was miscounted (12, not 11). Before the tests, a probe over every file showed the text count of tests short in two files: `<[^()]*>`, copied from shyden.co.uk, cannot read type arguments holding parentheses (`it.each<[string, () => Course]>`); `callOpening` balances them. The stage was first committed red, its new test file breaching `record-floors/test-files` (72 recorded, 73 read); the raise was folded into the stage before it was gated.

- [ ] **Step 4: Export the test-declaration helpers**

`tests/unit/one-test-per-case.ts`, as T2 changes it:

```diff
diff --git a/tests/unit/one-test-per-case.ts b/tests/unit/one-test-per-case.ts
index 997c292..06b0b45 100644
--- a/tests/unit/one-test-per-case.ts
+++ b/tests/unit/one-test-per-case.ts
@@ -104,9 +104,9 @@ const isAnnotation = (call: ts.CallExpression): boolean => {
  * the reader does not know, which is refused rather than skipped; or no call
  * on `it` or `test` at all.
  */
-type Kind = 'test' | 'table' | 'other' | 'unknown' | 'none';
+export type Kind = 'test' | 'table' | 'other' | 'unknown' | 'none';

-const kindOf = (call: ts.CallExpression): Kind => {
+export const kindOf = (call: ts.CallExpression): Kind => {
   const callee = call.expression;
   if (ts.isCallExpression(callee))
     return kindOf(callee) === 'table' ? 'test' : 'none';
@@ -128,13 +128,13 @@ const kindOf = (call: ts.CallExpression): Kind => {
  * A test's body: its first function argument. Not its last, since Vitest
  * takes a timeout or options after the body as well as before it.
  */
-const callbackOf = (
+export const callbackOf = (
   call: ts.CallExpression,
 ): ts.ArrowFunction | ts.FunctionExpression | null =>
   call.arguments.find(isFunction) ?? null;

 /** A title as written: a template keeps its `${…}`, so an entry naming it is stable. */
-const titleOf = (sf: ts.SourceFile, call: ts.CallExpression): string => {
+export const titleOf = (sf: ts.SourceFile, call: ts.CallExpression): string => {
   const first = call.arguments[0];
   if (!first) return '';
   if (ts.isStringLiteral(first) || ts.isNoSubstitutionTemplateLiteral(first))
@@ -143,7 +143,7 @@ const titleOf = (sf: ts.SourceFile, call: ts.CallExpression): string => {
 };

 /** The identifier a call chain starts from: `expect` for `expect.soft(x).not.toBe(y)`. */
-const chainRoot = (call: ts.CallExpression): string => {
+export const chainRoot = (call: ts.CallExpression): string => {
   let at: ts.Expression = call.expression;
   while (ts.isPropertyAccessExpression(at) || ts.isCallExpression(at))
     at = at.expression;
```

- [ ] **Step 5: Add codeWithoutLiterals**

`tests/unit/source-text.ts`, as T2 changes it:

```diff
diff --git a/tests/unit/source-text.ts b/tests/unit/source-text.ts
index c7189cc..998be6c 100644
--- a/tests/unit/source-text.ts
+++ b/tests/unit/source-text.ts
@@ -29,6 +29,41 @@
  * symptom.
  */

+import ts from 'typescript';
+
+/**
+ * `sf`'s code with every literal replaced by `""` and every comment removed
+ * (#361): what a text cross-check counts in, so a fixture string, a template
+ * or a regex spelling the construct it counts cannot satisfy it. The parse
+ * tree says what is a literal, outermost only, so a template is blanked whole
+ * with its substitutions. Once no string, template or regex is left, `//`
+ * and `/*` can only open comments, so a plain pattern removes them.
+ *
+ * The visitor returns nothing: `ts.forEachChild` stops at the first child
+ * whose callback returns a truthy value.
+ */
+export function codeWithoutLiterals(sf: ts.SourceFile): string {
+  const ranges: [number, number][] = [];
+  const visit = (node: ts.Node): void => {
+    if (
+      ts.isStringLiteral(node) ||
+      ts.isNoSubstitutionTemplateLiteral(node) ||
+      ts.isTemplateExpression(node) ||
+      ts.isRegularExpressionLiteral(node)
+    ) {
+      ranges.push([node.getStart(sf), node.end]);
+      return;
+    }
+    ts.forEachChild(node, visit);
+  };
+  visit(sf);
+  let code = sf.getFullText();
+  // End first, so each replacement leaves the earlier ranges where they were.
+  for (const [from, to] of ranges.reverse())
+    code = code.slice(0, from) + '""' + code.slice(to);
+  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
+}
+
 /**
  * YAML with comments removed, inline ones included, and blank lines dropped.
  *
```

- [ ] **Step 6: Write the reader**

`tests/unit/floorless-searches.ts`:

```ts
import ts from 'typescript';
import { callbackOf, chainRoot, kindOf, titleOf } from './one-test-per-case';

/**
 * Every absence search, where it sits, and whether a floor is checked on its
 * population in the same scope (#361).
 *
 * An absence search asserts that a population holds nothing it hunts. Refusing
 * an EMPTY population (`searched`) catches a reader blind to everything; a
 * reader blind to PART of its population still passes while one unit is read.
 * Only a floor recorded in `tests/floors.json` and checked for equality sees
 * that, so a scope that searches a population also checks a floor on THAT
 * population: `floorBreach(id, <of>.length)` (or `.size`, or `<of>` itself
 * for a count), `<of>` spelled as the search's `of:` spells it. A floor on
 * anything else in the same test is a token, not a check of this search.
 *
 * Two kinds of site:
 *
 * - a `searched(findings, { of, what })` call. Floored when its scope checks
 *   a floor on its `of:`.
 * - an `againstControl(run, { input, control })` call, for an input the test
 *   leaves empty on purpose (operator decision, 2026-10-05: empty input
 *   only). Proved when `input:` is an empty literal written in place and
 *   `run` is a function name, or a function of one parameter that uses it;
 *   the call itself proves the control finds something when it runs.
 * - a bare absence matcher, which names no population, so no floor can be
 *   bound to it and it is never floored: `toEqual([])`, `toStrictEqual([])`,
 *   `toEqual({})`, `toStrictEqual({})`, `toHaveLength(0)`, `.length` or
 *   `.size` to be 0, `.some(…)` to be false, `.every(…)` to be true, and a
 *   negated `toContain`, `toContainEqual` or `toMatch`. One whose subject is
 *   a `searched` or `againstControl` call, or a property of one, is that
 *   call's site, not a second one.
 *
 * Measured over the repository on 2026-10-05; a scalar `toBe(0)` or a bare
 * `toBeUndefined()` is not read, since the parse tree cannot tell an exit
 * status from a count without guessing from names.
 *
 * A `searched` call that is the whole body of a function handed to
 * `expect(…).toThrow(…)` searches nothing: it proves `searched` refuses a
 * population. It is counted as a refusal check, decided by that shape and
 * never by a label.
 *
 * There is no exemption. A site's scope is the innermost test body around it
 * (every form `kindOf` reads as a test), else the innermost named function.
 * Anywhere else (a hook, module level, an anonymous callback outside a test)
 * is refused by line, as is `searched` or `expect` imported under another
 * name, or `searched` read as a value: each is a site this reader would
 * otherwise not see.
 */
export type Form =
  'searched' | 'control' | 'empty' | 'no-match' | 'not-contained';

export interface SearchSite {
  /** 1-based line of the wrapper call, or of a bare form's `expect(`. */
  readonly line: number;
  readonly form: Form;
  readonly scope: 'test' | 'function';
  /** The test's title as written, or the function's name. */
  readonly label: string;
  /**
   * Proved live: a `searched` call whose scope checks `floorBreach` on the
   * population its `of:` names, or an `againstControl` call of the bound
   * shape. A bare form never is.
   */
  readonly proved: boolean;
}

export interface SearchReading {
  readonly sites: readonly SearchSite[];
  /** Every test body read, by title as written. */
  readonly tests: readonly string[];
  /** `searched` calls that only prove it throws. */
  readonly refusalChecks: number;
  /** Sites that sit in no test and no named function: refused. */
  readonly unplaced: number;
  /** Everything the reader could not classify, by line and why. */
  readonly refused: readonly string[];
}

const SEARCHED = 'searched';
const CONTROLLED = 'againstControl';
const WRAPPERS = [SEARCHED, CONTROLLED];
const EXPECT = 'expect';
const FLOOR = 'floorBreach';

/** Matchers whose argument says "empty": `[]` or `{}`. */
const EQUALITY = new Set(['toEqual', 'toStrictEqual']);
/** Matchers that, negated, say "no such member". */
const MEMBERSHIP = new Set(['toContain', 'toContainEqual', 'toMatch']);

const isFunction = (
  node: ts.Node,
): node is ts.ArrowFunction | ts.FunctionExpression =>
  ts.isArrowFunction(node) || ts.isFunctionExpression(node);

/** Every test body in `sf` to its title, in source order. */
function testBodiesIn(sf: ts.SourceFile): Map<ts.Node, string> {
  const bodies = new Map<ts.Node, string>();
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && kindOf(node) === 'test') {
      const callback = callbackOf(node);
      if (callback) bodies.set(callback, titleOf(sf, node));
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return bodies;
}

/** A function's own name, when it has one to be listed by. */
function nameOf(node: ts.Node): string | undefined {
  if (ts.isFunctionDeclaration(node) || ts.isMethodDeclaration(node))
    return node.name && ts.isIdentifier(node.name) ? node.name.text : undefined;
  if (!isFunction(node)) return undefined;
  const holder = node.parent;
  if (
    (ts.isVariableDeclaration(holder) || ts.isPropertyAssignment(holder)) &&
    holder.initializer === node &&
    ts.isIdentifier(holder.name)
  )
    return holder.name.text;
  return undefined;
}

/** The population a search names in `of:`, as written, or undefined. */
function populationOf(call: ts.CallExpression): ts.Expression | undefined {
  const population = call.arguments[1];
  if (!population || !ts.isObjectLiteralExpression(population))
    return undefined;
  const of = population.properties.find(
    (member) =>
      member.name !== undefined &&
      ts.isIdentifier(member.name) &&
      member.name.text === 'of',
  );
  if (of === undefined) return undefined;
  if (ts.isPropertyAssignment(of)) return of.initializer;
  if (ts.isShorthandPropertyAssignment(of)) return of.name;
  return undefined;
}

/** Source text with every space dropped: `a .b` and `a.b` are one name. */
const spelled = (sf: ts.SourceFile, node: ts.Node): string =>
  node.getText(sf).replace(/\s+/g, '');

/**
 * True where `scope` checks a floor on the very population `call` searches:
 * `floorBreach(id, <of>.length)`, `<of>.size`, or `<of>` itself for a count,
 * `<of>` spelled as the search spells it.
 */
function floorsPopulation(
  sf: ts.SourceFile,
  scope: ts.Node,
  call: ts.CallExpression,
): boolean {
  const population = populationOf(call);
  if (population === undefined) return false;
  const of = spelled(sf, population);
  const counts = new Set([of, `${of}.length`, `${of}.size`]);
  let found = false;
  const visit = (child: ts.Node): void => {
    if (
      ts.isCallExpression(child) &&
      ts.isIdentifier(child.expression) &&
      child.expression.text === FLOOR &&
      child.arguments[1] !== undefined &&
      counts.has(spelled(sf, child.arguments[1]))
    )
      found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(scope);
  return found;
}

/** `''`, `[]`, `{}`, `new Map()` or `new Set()`, written in place. */
const isEmptyInput = (node: ts.Expression): boolean =>
  ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) &&
    node.text === '') ||
  isEmptyLiteral(node) ||
  (ts.isNewExpression(node) &&
    ts.isIdentifier(node.expression) &&
    ['Map', 'Set'].includes(node.expression.text) &&
    (node.arguments ?? []).length === 0);

/** The initializer of `name:` in an object literal, or undefined. */
function propertyOf(
  literal: ts.Expression | undefined,
  name: string,
): ts.Expression | undefined {
  if (!literal || !ts.isObjectLiteralExpression(literal)) return undefined;
  const member = literal.properties.find(
    (each) =>
      ts.isPropertyAssignment(each) &&
      ts.isIdentifier(each.name) &&
      each.name.text === name,
  );
  return member && ts.isPropertyAssignment(member)
    ? member.initializer
    : undefined;
}

/** Whether `fn`'s body reads the identifier `name`. */
function reads(fn: ts.Node, name: string): boolean {
  let found = false;
  const visit = (child: ts.Node): void => {
    if (ts.isIdentifier(child) && child.text === name) found = true;
    if (!found) ts.forEachChild(child, visit);
  };
  visit(fn);
  return found;
}

/**
 * An `againstControl` call of the shape the operator decided: an empty
 * literal for `input:`, a `control:`, and a `run` that is a function's name
 * or a function of one parameter its body reads.
 */
function isBoundControl(call: ts.CallExpression): boolean {
  const [run, options] = call.arguments;
  const input = propertyOf(options, 'input');
  if (!run || !input || !propertyOf(options, 'control')) return false;
  if (!isEmptyInput(input)) return false;
  if (ts.isIdentifier(run) || ts.isPropertyAccessExpression(run)) return true;
  if (!isFunction(run) || run.parameters.length !== 1) return false;
  const [parameter] = run.parameters as unknown as [ts.ParameterDeclaration];
  return (
    ts.isIdentifier(parameter.name) && reads(run.body, parameter.name.text)
  );
}

/**
 * Whether `subject`, through any property reads and calls on it, starts
 * from a `searched` or `againstControl` call: `againstControl(…).size`.
 */
function startsFromWrapper(subject: ts.Expression): boolean {
  let at: ts.Expression = subject;
  for (;;) {
    if (ts.isCallExpression(at)) {
      if (
        ts.isIdentifier(at.expression) &&
        WRAPPERS.includes(at.expression.text)
      )
        return true;
      at = at.expression;
    } else if (ts.isPropertyAccessExpression(at)) at = at.expression;
    else return false;
  }
}

/** `name(…)` called directly by that name. */
const isCallTo = (node: ts.Node, name: string): node is ts.CallExpression =>
  ts.isCallExpression(node) &&
  ts.isIdentifier(node.expression) &&
  node.expression.text === name;

/**
 * The `expect(…)` call an assertion starts from, and whether `.not` sits
 * between it and the matcher: `expect(x).not.toContain(y)`, or
 * `expect.soft(x)`. Undefined for any other callee.
 */
function expectationOf(
  matcher: ts.PropertyAccessExpression,
): { expectation: ts.CallExpression; negated: boolean } | undefined {
  let target = matcher.expression;
  let negated = false;
  if (ts.isPropertyAccessExpression(target) && target.name.text === 'not') {
    negated = true;
    target = target.expression;
  }
  if (!ts.isCallExpression(target)) return undefined;
  const callee = target.expression;
  const isExpect =
    (ts.isIdentifier(callee) && callee.text === EXPECT) ||
    (ts.isPropertyAccessExpression(callee) &&
      ts.isIdentifier(callee.expression) &&
      callee.expression.text === EXPECT &&
      callee.name.text === 'soft');
  return isExpect ? { expectation: target, negated } : undefined;
}

/** `xs.method(…)` for one of `methods`. */
const isMethodCall = (node: ts.Node, methods: readonly string[]): boolean =>
  ts.isCallExpression(node) &&
  ts.isPropertyAccessExpression(node.expression) &&
  methods.includes(node.expression.name.text);

const isEmptyLiteral = (node: ts.Node | undefined): boolean =>
  node !== undefined &&
  ((ts.isArrayLiteralExpression(node) && node.elements.length === 0) ||
    (ts.isObjectLiteralExpression(node) && node.properties.length === 0));

const isZero = (node: ts.Node | undefined): boolean =>
  node !== undefined && ts.isNumericLiteral(node) && node.text === '0';

/**
 * The absence form a matcher call asserts, or undefined: the bare forms only.
 * `subject` is what `expect` was handed.
 */
function bareForm(
  name: string,
  argument: ts.Expression | undefined,
  subject: ts.Expression,
  negated: boolean,
): Form | undefined {
  if (negated) return MEMBERSHIP.has(name) ? 'not-contained' : undefined;
  if (EQUALITY.has(name) && isEmptyLiteral(argument)) return 'empty';
  if (name === 'toHaveLength' && isZero(argument)) return 'empty';
  if (
    (name === 'toBe' || EQUALITY.has(name)) &&
    isZero(argument) &&
    ts.isPropertyAccessExpression(subject) &&
    (subject.name.text === 'length' || subject.name.text === 'size')
  )
    return 'empty';
  if (name !== 'toBe' || argument === undefined) return undefined;
  if (
    argument.kind === ts.SyntaxKind.FalseKeyword &&
    isMethodCall(subject, ['some'])
  )
    return 'no-match';
  if (
    argument.kind === ts.SyntaxKind.TrueKeyword &&
    isMethodCall(subject, ['every'])
  )
    return 'no-match';
  return undefined;
}

/**
 * True where `call` is the whole body of a function handed to
 * `expect(…).toThrow(…)` or `.toThrowError(…)`, not negated.
 */
function onlyProvesItThrows(call: ts.CallExpression): boolean {
  let body: ts.Node = call;
  if (ts.isExpressionStatement(call.parent)) {
    const statement = call.parent;
    const block = statement.parent;
    if (!ts.isBlock(block) || block.statements.length !== 1) return false;
    body = block;
  }
  const fn = body.parent;
  if (!isFunction(fn) || fn.body !== body) return false;
  const expectation = fn.parent;
  if (
    !isCallTo(expectation, EXPECT) ||
    expectation.arguments[0] !== fn ||
    !ts.isPropertyAccessExpression(expectation.parent)
  )
    return false;
  const matcher = expectation.parent;
  return (
    (matcher.name.text === 'toThrow' || matcher.name.text === 'toThrowError') &&
    ts.isCallExpression(matcher.parent) &&
    matcher.parent.expression === matcher
  );
}

export function searchSitesIn(sf: ts.SourceFile): SearchReading {
  const bodies = testBodiesIn(sf);
  const sites: SearchSite[] = [];
  const refused: string[] = [];
  let refusalChecks = 0;
  let unplaced = 0;
  const lineOf = (node: ts.Node): number =>
    sf.getLineAndCharacterOfPosition(node.getStart(sf)).line + 1;
  const refuse = (node: ts.Node, why: string): void => {
    refused.push(`${sf.fileName}:${String(lineOf(node))}: ${why}`);
  };

  const site = (at: ts.Node, form: Form, call?: ts.CallExpression): void => {
    for (let scope = at.parent; ; scope = scope.parent) {
      if (ts.isSourceFile(scope)) {
        unplaced += 1;
        refuse(at, 'a search in no test and no named function');
        return;
      }
      const title = bodies.get(scope);
      const name = title === undefined ? nameOf(scope) : undefined;
      if (title === undefined && name === undefined) continue;
      sites.push({
        line: lineOf(at),
        form,
        scope: title === undefined ? 'function' : 'test',
        label: title ?? (name as string),
        proved:
          call !== undefined &&
          (form === 'control'
            ? isBoundControl(call)
            : floorsPopulation(sf, scope, call)),
      });
      return;
    }
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isImportSpecifier(node) &&
      (node.propertyName ?? node.name).text !== node.name.text &&
      [...WRAPPERS, EXPECT].includes((node.propertyName ?? node.name).text)
    )
      refuse(
        node,
        `${(node.propertyName ?? node.name).text} imported under another name, ${node.name.text}`,
      );
    if (ts.isIdentifier(node) && WRAPPERS.includes(node.text)) {
      const parent = node.parent;
      const form: Form = node.text === SEARCHED ? 'searched' : 'control';
      if (ts.isCallExpression(parent) && parent.expression === node) {
        if (onlyProvesItThrows(parent)) refusalChecks += 1;
        else site(parent, form, parent);
      } else if (
        !ts.isImportSpecifier(parent) &&
        !ts.isExportSpecifier(parent) &&
        !(ts.isFunctionDeclaration(parent) && parent.name === node)
      )
        refuse(node, `${node.text} read as a value, not called`);
    }
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      chainRoot(node) === EXPECT
    ) {
      const read = expectationOf(node.expression);
      const subject = read?.expectation.arguments[0];
      if (read && subject && !startsFromWrapper(subject)) {
        const form = bareForm(
          node.expression.name.text,
          node.arguments[0],
          subject,
          read.negated,
        );
        if (form !== undefined) site(read.expectation, form);
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return {
    sites,
    tests: [...bodies.values()],
    refusalChecks,
    unplaced,
    refused,
  };
}
```

- [ ] **Step 7: Write the text counts**

`tests/unit/absence-text.ts`:

```ts
/**
 * The cross-check on `floorless-searches.ts`, read from text (#361).
 *
 * The reader walks the parse tree; this counts the same constructs in a
 * file's code with every literal and comment removed (`codeWithoutLiterals`),
 * by balancing brackets, and shares no helper with it. A form the reader
 * stops seeing still shows here, so a file whose two counts differ is a
 * finding. Its lists are its own on purpose: a list shared with the reader
 * would go blind with it.
 */

/** Run modifiers and table forms of `it`/`test` that still declare a test. */
const MODIFIERS = new Set([
  'only',
  'skip',
  'fails',
  'concurrent',
  'fixme',
  'fail',
  'slow',
]);
const TABLES = new Set(['each', 'for']);

const OPENERS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
const CLOSERS = new Set([')', ']', '}']);

/** The index of the bracket closing the one at `open`, or -1. */
export function closing(code: string, open: number): number {
  let depth = 0;
  for (let at = open; at < code.length; at += 1) {
    const char = code[at] as string;
    if (char in OPENERS) depth += 1;
    else if (CLOSERS.has(char)) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/** The index of the bracket opening the one at `close`, or -1. */
function opening(code: string, close: number): number {
  let depth = 0;
  for (let at = close; at >= 0; at -= 1) {
    const char = code[at] as string;
    if (CLOSERS.has(char)) depth += 1;
    else if (char in OPENERS) {
      depth -= 1;
      if (depth === 0) return at;
    }
  }
  return -1;
}

/** `text` split at the commas outside any bracket, each part trimmed, empties dropped. */
export function topLevelArguments(text: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let from = 0;
  for (let at = 0; at < text.length; at += 1) {
    const char = text[at] as string;
    if (char in OPENERS) depth += 1;
    else if (CLOSERS.has(char)) depth -= 1;
    else if (char === ',' && depth === 0) {
      parts.push(text.slice(from, at));
      from = at + 1;
    }
  }
  parts.push(text.slice(from));
  return parts.map((part) => part.trim()).filter((part) => part !== '');
}

/** The text between the bracket at `open` and its closer, or undefined. */
const inside = (code: string, open: number): string | undefined => {
  const close = closing(code, open);
  return close === -1 ? undefined : code.slice(open + 1, close);
};

/** Whether `text` ends with a call of `.name(…)`. */
function endsWithCallOf(text: string, name: string): boolean {
  const trimmed = text.trimEnd();
  if (!trimmed.endsWith(')')) return false;
  const open = opening(trimmed, trimmed.length - 1);
  return (
    open > 0 &&
    new RegExp(`\\.\\s*${name}\\s*(?:<[^()]*>)?\\s*$`).test(
      trimmed.slice(0, open),
    )
  );
}

/**
 * The index of the `(` that calls what ends just before `at`, past any type
 * arguments, or -1. Type arguments may hold parentheses and arrows,
 * `<[string, () => Course]>`, so they are skipped by balancing `<` and `>`,
 * where the `>` of an arrow `=>` closes nothing.
 */
export function callOpening(code: string, at: number): number {
  let index = at;
  const skipSpace = (): void => {
    while (/\s/.test(code[index] ?? '')) index += 1;
  };
  skipSpace();
  if (code[index] === '<') {
    let depth = 0;
    for (; index < code.length; index += 1) {
      const char = code[index];
      if (char === '<') depth += 1;
      else if (char === '>' && code[index - 1] !== '=') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) return -1;
    index += 1;
    skipSpace();
  }
  return code[index] === '(' ? index : -1;
}

/**
 * Whether `subject` starts with a `searched(…)` or `againstControl(…)` call,
 * whatever is read from it after: `againstControl(…).size`.
 */
function startsWithWrapper(subject: string): boolean {
  const name = /^(?:searched|againstControl)(?![\w$])/.exec(subject);
  return name !== null && callOpening(subject, name[0].length) !== -1;
}

/** Whether an `expect(subject)…name(argument)` assertion is a bare absence form. */
function isBareAbsence(
  subject: string,
  negated: boolean,
  name: string,
  argument: string,
): boolean {
  if (startsWithWrapper(subject)) return false;
  if (negated) return ['toContain', 'toContainEqual', 'toMatch'].includes(name);
  const equality = name === 'toEqual' || name === 'toStrictEqual';
  if (equality && /^(\[\s*\]|\{\s*\})$/.test(argument)) return true;
  if (name === 'toHaveLength' && argument === '0') return true;
  if (
    (name === 'toBe' || equality) &&
    argument === '0' &&
    /\.\s*(length|size)$/.test(subject)
  )
    return true;
  if (name !== 'toBe') return false;
  return (
    (argument === 'false' && endsWithCallOf(subject, 'some')) ||
    (argument === 'true' && endsWithCallOf(subject, 'every'))
  );
}

const EXPECT = /(?<![\w$.])expect\s*(?:\.\s*soft\s*)?\(/g;
const MATCHER = /^\s*(\.\s*not\s*)?\.\s*(\w+)\s*\(/;

/** How many bare absence assertions `code` writes (literals and comments already removed). */
export function bareAbsencesWritten(code: string): number {
  let count = 0;
  for (const match of code.matchAll(EXPECT)) {
    const open = match.index + match[0].length - 1;
    const close = closing(code, open);
    if (close === -1) continue;
    const [subject = ''] = topLevelArguments(code.slice(open + 1, close));
    const after = code.slice(close + 1);
    const matcher = MATCHER.exec(after);
    if (!matcher) continue;
    const argumentOpen = close + 1 + matcher[0].length - 1;
    const [argument = ''] = topLevelArguments(inside(code, argumentOpen) ?? '');
    if (
      isBareAbsence(
        subject,
        matcher[1] !== undefined,
        matcher[2] as string,
        argument,
      )
    )
      count += 1;
  }
  return count;
}

/**
 * How many `searched` and `againstControl` calls `code` writes: after
 * anything but a name character or a property dot, so `[...searched(` counts
 * and `obj.searched(` does not. A definition, `function searched<T>(`, is no
 * call.
 */
export function searchesWritten(code: string): number {
  const calls = code.replace(
    /(?<![\w$])function\s+(?:searched|againstControl)(?![\w$])/g,
    'function _',
  );
  return [
    ...calls.matchAll(
      /(?<![\w$])(?<!(?<!\.\.)\.)(?:searched|againstControl)(?![\w$])/g,
    ),
  ].filter((match) => callOpening(calls, match.index + match[0].length) !== -1)
    .length;
}

/** Every absence site `code` writes: searches plus bare forms. */
export const absencesWritten = (code: string): number =>
  searchesWritten(code) + bareAbsencesWritten(code);

const FUNCTION_TEXT =
  /^(?:async\s*)?(?:function\b|(?:\([\s\S]*?\)|[\w$]+)\s*(?::[^=]+)?=>)/;

const TEST_NAME = /(?<![\w$.])(?:it|test)((?:\s*\.\s*[\w$]+)*)(?![\w$])/g;

/**
 * How many tests `code` declares with a body: `it`/`test`, their run
 * modifiers, and a table form's second call. An annotation, `test.skip(cond,
 * why)`, has no body, or a predicate first, and declares none.
 */
export function testsWritten(code: string): number {
  let count = 0;
  for (const match of code.matchAll(TEST_NAME)) {
    const members = (match[1] ?? '')
      .split('.')
      .map((member) => member.trim())
      .filter((member) => member !== '');
    const last = members.at(-1);
    const table = last !== undefined && TABLES.has(last);
    const modifiers = table ? members.slice(0, -1) : members;
    if (!modifiers.every((member) => MODIFIERS.has(member))) continue;
    let open = callOpening(code, match.index + match[0].length);
    if (open === -1) continue;
    if (table) {
      const tableClose = closing(code, open);
      const next = /^\s*\(/.exec(code.slice(tableClose + 1));
      if (tableClose === -1 || !next) continue;
      open = tableClose + next[0].length;
    }
    const args = topLevelArguments(inside(code, open) ?? '');
    const [first = ''] = args;
    if (
      !FUNCTION_TEXT.test(first) &&
      args.some((arg) => FUNCTION_TEXT.test(arg))
    )
      count += 1;
  }
  return count;
}
```

- [ ] **Step 8: Write againstControl**

`tests/searched.ts`, as T2 changes it:

```diff
diff --git a/tests/searched.ts b/tests/searched.ts
index 3decbab..ec7f2d5 100644
--- a/tests/searched.ts
+++ b/tests/searched.ts
@@ -54,3 +54,36 @@ function isSubstantive(member: unknown): boolean {
   if (typeof member === 'object') return Object.keys(member).length > 0;
   return true;
 }
+
+/**
+ * A search over an input the test leaves empty on purpose, proved live by a
+ * positive control (#361, operator decision 2026-10-05: empty input only).
+ *
+ * `expect(parseLog('')).toEqual([])` checks that nothing in gives nothing
+ * out, and a dead parser passes it. `searched` cannot help, since the
+ * population is empty by design, so no floor can be recorded on it either:
+ *
+ *     expect(againstControl(parseLog, { input: '', control: ONE_COMMIT })).toEqual([]);
+ *
+ * runs `run` on the control, which must find something, then returns what it
+ * finds in `input`, which must be empty. A `run` that ignored its argument
+ * would return the same thing twice, and one result cannot be both, so that
+ * shortcut fails by itself. `floorless-searches.test.ts` holds the rest: the
+ * input is an empty literal written in place, and nothing else uses this.
+ */
+export function againstControl<I, R>(
+  run: (input: I) => R,
+  { input, control }: { input: I; control: I },
+): R {
+  if (isSubstantive(input))
+    throw new Error(
+      'againstControl is for an empty input; a search over a population ' +
+        'checks a recorded floor instead',
+    );
+  if (!isSubstantive(run(control)))
+    throw new Error(
+      'the control found nothing, so this cannot tell nothing in from a dead ' +
+        'function',
+    );
+  return run(input);
+}
```

- [ ] **Step 9: Raise the test-file floor for the new test file**

`tests/floors.json`, as T2 changes it:

```diff
diff --git a/tests/floors.json b/tests/floors.json
index 62f8c76..06ee9a2 100644
--- a/tests/floors.json
+++ b/tests/floors.json
@@ -1,5 +1,5 @@
 {
-  "record-floors/test-files": 72,
+  "record-floors/test-files": 73,
   "record-floors/workflow-steps": 30,
   "searched/count": 3,
   "searched/live": 2,
```

- [ ] **Step 10: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/floorless-searches.test.ts tests/unit/searched.test.ts tests/unit/one-test-per-case.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `The absence-search reader, its text cross-check, and againstControl (Refs #361)`.

### Task 3: The meta-guard and its burn-down list

**Files:**

- Create: `tests/unit/floorless-searches.burn-down.ts`
- Modify: `tests/unit/floorless-searches.ts`, `tests/unit/floorless-searches.test.ts`, `tests/unit/tracked-files.ts`, `tests/floors.json`

**Interfaces:**

- Consumes: Tasks 1 and 2. Produces: `burnDownFindings(sites, listed)`, `scopeKey`, `walkDisagreements`, `UNPROVED`, and the four repository-wide tests.

- [ ] **Step 1: Write the failing tests**

`tests/unit/floorless-searches.test.ts`, as T3 changes it:

```diff
diff --git a/tests/unit/floorless-searches.test.ts b/tests/unit/floorless-searches.test.ts
index 31e8389..a78635e 100644
--- a/tests/unit/floorless-searches.test.ts
+++ b/tests/unit/floorless-searches.test.ts
@@ -1,11 +1,20 @@
 import ts from 'typescript';
 import { describe, expect, it } from 'vitest';
 import { absencesWritten, callOpening, testsWritten } from './absence-text';
+import { readFileSync } from 'node:fs';
 import {
+  burnDownFindings,
+  scopeKey,
   searchSitesIn,
+  walkDisagreements,
+  type FiledSite,
   type Form,
   type SearchReading,
 } from './floorless-searches';
+import { UNPROVED } from './floorless-searches.burn-down';
+import { floorBreach } from '../floors';
+import { searched } from '../searched';
+import { committableFiles } from './tracked-files';
 import { codeWithoutLiterals } from './source-text';

 /**
@@ -532,3 +541,279 @@ describe('the text counts', () => {
     expect(callOpening(code, at)).toBe(open);
   });
 });
+
+/**
+ * Planted by hand: every form, in each kind of file the walk reads (a vitest
+ * test, a Playwright spec, a helper's named function), must be read as one
+ * unproved site, counted as written, and turned into a finding.
+ */
+const PLANTED_FORMS = [
+  'expect(xs).toEqual([]);',
+  'expect(xs).toStrictEqual([]);',
+  'expect(o).toEqual({});',
+  'expect(o).toStrictEqual({});',
+  'expect(xs).toHaveLength(0);',
+  'expect(xs.length).toBe(0);',
+  'expect(s.size).toBe(0);',
+  'expect(xs.some((x) => x)).toBe(false);',
+  'expect(xs.every((x) => x)).toBe(true);',
+  'expect(text).not.toContain("<");',
+  'expect(xs).not.toContainEqual(1);',
+  'expect(text).not.toMatch(/x/);',
+  "expect(searched(f, { of: p, what: 'w' })).toEqual([]);",
+  'expect(againstControl(f, { input: NONE, control: ONE })).toEqual([]);',
+];
+const PLANTED_KINDS = [
+  ['a vitest test', 'planted.test.ts', 't', "it('t', () => {\n", '\n});'],
+  [
+    'a Playwright spec',
+    'planted.spec.ts',
+    't',
+    "test('t', async () => {\n",
+    '\n});',
+  ],
+  ['a helper', 'planted.ts', 'check', 'export function check() {\n', '\n}'],
+] as const;
+const PLANTED = PLANTED_KINDS.flatMap(([kind, file, label, before, after]) =>
+  PLANTED_FORMS.map(
+    (form) => [kind, form, file, label, before, after] as const,
+  ),
+);
+
+describe('the meta-guard sees every form planted in every kind of file', () => {
+  it.each(PLANTED)('%s: %s', (_kind, form, file, label, before, after) => {
+    const sf = ts.createSourceFile(
+      file,
+      `${before}${form}${after}`,
+      ts.ScriptTarget.Latest,
+      true,
+    );
+    const { sites } = searchSitesIn(sf);
+    expect({
+      read: sites.length,
+      written: absencesWritten(codeWithoutLiterals(sf)),
+      findings: burnDownFindings(
+        sites.map((site) => ({ file, ...site })),
+        {},
+      ),
+    }).toEqual({
+      read: 1,
+      written: 1,
+      findings: [
+        `${scopeKey(file, label)}: 1 unproved, 0 listed. Check a recorded ` +
+          "floor on each search's population in the same test (searched + " +
+          'floorBreach), or use againstControl for an input left empty on purpose.',
+      ],
+    });
+  });
+});
+
+const at = (label: string, proved = false): FiledSite => ({
+  file: 'a.test.ts',
+  label,
+  proved,
+});
+
+describe('burnDownFindings', () => {
+  it('finds nothing when every unproved scope is listed at its count', () => {
+    const sites = [at('t'), at('t'), at('u', true)];
+    expect(
+      searched(burnDownFindings(sites, { 'a.test.ts › t': 2 }), {
+        of: sites,
+        what: 'planted sites',
+      }),
+    ).toEqual([]);
+    expect(
+      floorBreach('floorless-searches/fixture-listed', sites.length),
+    ).toBeUndefined();
+  });
+
+  it.each([
+    [
+      'more unproved than listed',
+      [at('t'), at('t')],
+      { 'a.test.ts › t': 1 },
+      '2 unproved, 1 listed. Check',
+    ],
+    [
+      'an unproved scope not listed',
+      [at('t')],
+      {},
+      '1 unproved, 0 listed. Check',
+    ],
+    [
+      'fewer unproved than listed',
+      [at('t')],
+      { 'a.test.ts › t': 2 },
+      '1 unproved, 2 listed. Lower',
+    ],
+    [
+      'a listed scope with none left',
+      [at('t', true)],
+      { 'a.test.ts › t': 1 },
+      '0 unproved, 1 listed. Lower',
+    ],
+    [
+      'an entry of zero',
+      [at('t', true)],
+      { 'a.test.ts › t': 0 },
+      'listed as 0, not a count',
+    ],
+    [
+      'a fractional entry',
+      [at('t')],
+      { 'a.test.ts › t': 1.5 },
+      'listed as 1.5, not a count',
+    ],
+  ])('finds %s', (_what, sites, listed, message) => {
+    expect(burnDownFindings(sites, listed)).toEqual([
+      expect.stringContaining(`a.test.ts › t: ${message}`),
+    ]);
+  });
+});
+
+describe('walkDisagreements', () => {
+  it('names a path on either side alone', () => {
+    expect(walkDisagreements(['a.ts', 'b.ts'], ['b.ts', 'c.ts'])).toEqual([
+      "a.ts: walked, not in git's list",
+      "c.ts: in git's list, not walked",
+    ]);
+  });
+
+  it('finds nothing when both lists hold the same paths', () => {
+    const walked = ['a.ts', 'b.ts'];
+    expect(
+      searched(walkDisagreements(walked, ['b.ts', 'a.ts']), {
+        of: walked,
+        what: 'planted paths',
+      }),
+    ).toEqual([]);
+    expect(
+      floorBreach('floorless-searches/fixture-walk', walked.length),
+    ).toBeUndefined();
+  });
+});
+
+/**
+ * Every TypeScript file git has, walked with a regex over its whole list,
+ * and what the reader made of each. Read once, on first use inside a test:
+ * nothing reaches workspace code while the file is collected.
+ */
+let walked:
+  | {
+      files: string[];
+      readings: (SearchReading & { file: string; code: string })[];
+      sites: (FiledSite & { form: Form })[];
+      tests: string[];
+    }
+  | undefined;
+const repository = () => {
+  if (walked !== undefined) return walked;
+  const files = committableFiles().filter((path) => /\.[cm]?ts$/.test(path));
+  const readings = files.map((file) => {
+    const sf = ts.createSourceFile(
+      file,
+      readFileSync(file, 'utf8'),
+      ts.ScriptTarget.Latest,
+      true,
+    );
+    return { file, code: codeWithoutLiterals(sf), ...searchSitesIn(sf) };
+  });
+  walked = {
+    files,
+    readings,
+    sites: readings.flatMap(({ file, sites }) =>
+      sites.map((site) => ({ file, ...site })),
+    ),
+    tests: readings.flatMap(({ file, tests }) =>
+      tests.map((title) => scopeKey(file, title)),
+    ),
+  };
+  return walked;
+};
+
+/** The burn-down list's size when the meta-guard landed (#361): it only shrinks. */
+const CEILING_SITES = 155;
+const CEILING_SCOPES = 141;
+
+describe('every absence search is proved, or listed (#361)', () => {
+  it('finds every scope holding exactly the unproved searches listed', () => {
+    const { readings, sites: SITES } = repository();
+    const refused = readings.flatMap(({ refused }) => refused);
+    const findings = burnDownFindings(SITES, UNPROVED);
+    expect(
+      searched(refused, { of: SITES, what: 'absence sites' }),
+      refused.join('\n'),
+    ).toEqual([]);
+    expect(
+      searched(findings, { of: SITES, what: 'absence sites' }),
+      findings.join('\n'),
+    ).toEqual([]);
+    expect(
+      floorBreach('floorless-searches/sites', SITES.length),
+    ).toBeUndefined();
+  });
+
+  it('only shrinks the burn-down list', () => {
+    // Measured when the meta-guard landed (#361). A conversion lowers these
+    // with the list; nothing raises them.
+    const counts = Object.values(UNPROVED);
+    expect(counts.reduce((sum, n) => sum + n, 0)).toBeLessThanOrEqual(
+      CEILING_SITES,
+    );
+    expect(counts.length).toBeLessThanOrEqual(CEILING_SCOPES);
+  });
+});
+
+describe('the reader proves what it read (#361)', () => {
+  it('reads as many absence sites in each file as its text writes, over every file git has', () => {
+    const { readings, files: FILES } = repository();
+    // Independent of the parse tree (control c): the constructs counted in
+    // each file's code with literals and comments removed, against what the
+    // reader returned for that file. The walk is checked against git's own
+    // globs, a second reading of the same list.
+    const misread = readings
+      .filter(
+        ({ code, sites, refusalChecks, unplaced }) =>
+          absencesWritten(code) !== sites.length + refusalChecks + unplaced,
+      )
+      .map(
+        ({ file, code, sites, refusalChecks, unplaced }) =>
+          `${file}: ${String(absencesWritten(code))} written, ${String(sites.length + refusalChecks + unplaced)} read`,
+      );
+    const walk = walkDisagreements(
+      FILES,
+      committableFiles(['*.ts', '*.mts', '*.cts']),
+    );
+    expect(
+      searched(misread, { of: FILES, what: 'TypeScript files' }),
+      misread.join('\n'),
+    ).toEqual([]);
+    expect(
+      searched(walk, { of: FILES, what: 'TypeScript files' }),
+      walk.join('\n'),
+    ).toEqual([]);
+    expect(
+      floorBreach('floorless-searches/files', FILES.length),
+    ).toBeUndefined();
+  });
+
+  it('reads as many tests in each file as its text writes', () => {
+    const { readings, tests: TESTS } = repository();
+    // A site's scope is the test around it, so a test form the reader cannot
+    // see sends its sites elsewhere.
+    const misread = readings
+      .filter(({ code, tests }) => testsWritten(code) !== tests.length)
+      .map(
+        ({ file, code, tests }) =>
+          `${file}: ${String(testsWritten(code))} written, ${String(tests.length)} read`,
+      );
+    expect(
+      searched(misread, { of: TESTS, what: 'tests read' }),
+      misread.join('\n'),
+    ).toEqual([]);
+    expect(
+      floorBreach('floorless-searches/tests', TESTS.length),
+    ).toBeUndefined();
+  });
+});
```

- [ ] **Step 2: Run it red**

Run: `npx vitest run tests/unit/floorless-searches.test.ts tests/unit/collection-calls.test.ts`

Seen red after the stage was committed and gated, against a stub of `tests/unit/floorless-searches.ts` whose `burnDownFindings`, `scopeKey` and `walkDisagreements` throw "not implemented" (the reader kept): 54 of the stage's 55 new tests failed. The one that passed, "only shrinks the burn-down list", reads only the list and its ceilings and calls none of them; mutation B2 proves it goes red. The 114 others that passed are Task 2's reader tests. Doing this run after the commit, not before the code, is out of TDD order, and is said here rather than hidden. The first record run of this stage failed `collection-calls`, which refuses workspace code reached while a file is collected: the walk ran at module level and the planted table built its sources through a function. The walk is now read lazily inside the tests (`repository()`), and each planted source is built inside its test; both fixes are in this stage. The burn-down list was generated from the reader's own output over the repository, then formatted.

- [ ] **Step 3: Write burnDownFindings and walkDisagreements**

`tests/unit/floorless-searches.ts`, as T3 changes it:

```diff
diff --git a/tests/unit/floorless-searches.ts b/tests/unit/floorless-searches.ts
index a41617f..b0c198f 100644
--- a/tests/unit/floorless-searches.ts
+++ b/tests/unit/floorless-searches.ts
@@ -444,3 +444,67 @@ export function searchSitesIn(sf: ts.SourceFile): SearchReading {
     refused,
   };
 }
+
+/** A site with the file it was read in. */
+export interface FiledSite {
+  readonly file: string;
+  readonly label: string;
+  readonly proved: boolean;
+}
+
+/** The burn-down key of a scope: `file › test title as written`. */
+export const scopeKey = (file: string, label: string): string =>
+  `${file} › ${label}`;
+
+/**
+ * Every scope whose unproved sites differ from the burn-down list, both
+ * ways, and every entry that is not a whole number of at least one: a site
+ * added without its proof fails, and so does one proved without the list
+ * being lowered, so the list only shrinks.
+ */
+export function burnDownFindings(
+  sites: readonly FiledSite[],
+  listed: Readonly<Record<string, number>>,
+): string[] {
+  const now = new Map<string, number>();
+  for (const { file, label, proved } of sites)
+    if (!proved) {
+      const key = scopeKey(file, label);
+      now.set(key, (now.get(key) ?? 0) + 1);
+    }
+  const keys = [...new Set([...now.keys(), ...Object.keys(listed)])].sort();
+  return keys.flatMap((key) => {
+    const read = now.get(key) ?? 0;
+    const entry = listed[key];
+    if (entry !== undefined && (!Number.isInteger(entry) || entry < 1))
+      return [`${key}: listed as ${String(entry)}, not a count of at least 1`];
+    const count = entry ?? 0;
+    if (read > count)
+      return [
+        `${key}: ${String(read)} unproved, ${String(count)} listed. Check a ` +
+          `recorded floor on each search's population in the same test ` +
+          `(searched + floorBreach), or use againstControl for an input left ` +
+          `empty on purpose.`,
+      ];
+    if (read < count)
+      return [
+        `${key}: ${String(read)} unproved, ${String(count)} listed. Lower ` +
+          `the entry in tests/unit/floorless-searches.burn-down.ts: the list ` +
+          `only shrinks.`,
+      ];
+    return [];
+  });
+}
+
+/** Paths one list holds and the other does not, both ways. */
+export const walkDisagreements = (
+  walked: readonly string[],
+  known: readonly string[],
+): string[] => [
+  ...walked
+    .filter((path) => !known.includes(path))
+    .map((path) => `${path}: walked, not in git's list`),
+  ...known
+    .filter((path) => !walked.includes(path))
+    .map((path) => `${path}: in git's list, not walked`),
+];
```

- [ ] **Step 4: Let committableFiles take git pathspecs**

`tests/unit/tracked-files.ts`, as T3 changes it:

```diff
diff --git a/tests/unit/tracked-files.ts b/tests/unit/tracked-files.ts
index 2098dc8..231b5d8 100644
--- a/tests/unit/tracked-files.ts
+++ b/tests/unit/tracked-files.ts
@@ -14,11 +14,20 @@ export const trackedFiles = (): string[] =>
  * Every path git tracks or would track at the next `git add -A`: tracked,
  * plus untracked and not ignored. A test file written before its `git add`
  * is in it, so a count over it does not move when the file is committed.
+ * `pathspecs` narrow it with git's own globs, `'*.ts'` matching at any depth.
  */
-export const committableFiles = (): string[] =>
+export const committableFiles = (pathspecs: readonly string[] = []): string[] =>
   execFileSync(
     'git',
-    ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
+    [
+      'ls-files',
+      '-z',
+      '--cached',
+      '--others',
+      '--exclude-standard',
+      '--',
+      ...pathspecs,
+    ],
     { encoding: 'utf8' },
   )
     .split('\0')
```

- [ ] **Step 5: Write the burn-down list, measured**

`tests/unit/floorless-searches.burn-down.ts`:

```ts
/**
 * Every scope holding an absence search that proves nothing about its
 * population, by `file › test title as written` (or the named function), with
 * how many (#361). Measured when the meta-guard landed. A search is proved by
 * a recorded floor on the population its `of:` names, checked in the same
 * scope, or, for an input left empty on purpose, by againstControl.
 *
 * Checked for equality both ways by `floorless-searches.test.ts`: a new
 * unproved search fails, and so does a converted one until its entry is
 * lowered. It only shrinks.
 */
export const UNPROVED: Readonly<Record<string, number>> = {
  'apps/web/test/gate.test.ts › refuses a real built asset %s and sends none of its bytes': 1,
  'apps/web/test/gate.test.ts › refuses the page %s without credentials': 1,
  'packages/bots/pacing/pacing.test.ts › (a) %s sets sail for the first time after 30 to 60 minutes': 1,
  'packages/bots/pacing/pacing.test.ts › (b) the Casual Learner reaches each later destination 1 to 3 days after the one before': 1,
  'packages/bots/pacing/pacing.test.ts › (c) the Casual Learner reaches the finale in 3 to 5 weeks': 1,
  'packages/bots/pacing/pacing.test.ts › (d) the Idler reaches the finale within 10 weeks': 1,
  'packages/bots/pacing/pacing.test.ts › (e) every open of %s offers a meaningful decision': 1,
  'packages/bots/pacing/pacing.test.ts › (f) learning pays: the Casual Learner reaches the finale at least 20% sooner than the Non-learner': 1,
  'packages/bots/pacing/pacing.test.ts › (f) the Diligent Learner finishes no later than the Casual Learner, nor the Casual Learner than the Idler': 1,
  'packages/bots/pacing/pacing.test.ts › (g) clicking never beats idling: the Clicker takes at least 95% of the Casual Learner’s time to reach each sail’s goal': 1,
  'packages/bots/pacing/pacing.test.ts › (h) %s meets no NaN, negative or infinite value': 1,
  'packages/bots/test/calibrate.test.ts › fits each goal so its sail lands by its target and within 0.01 days of it': 1,
  'packages/bots/test/calibrate.test.ts › fits each later goal about a gap of decades above the one before': 1,
  'packages/bots/test/calibrate.test.ts › shows the measure only the goals fitted so far, the rest unreachable': 3,
  'packages/bots/test/calibrate.test.ts › writes each goal with 3 significant figures': 1,
  'packages/bots/test/player.test.ts › a Non-learner answers none': 1,
  'packages/bots/test/player.test.ts › a learner answers every due review': 1,
  'packages/bots/test/player.test.ts › buys until nothing is affordable': 1,
  'packages/bots/test/player.test.ts › reports no decision when nothing is affordable, due, free or available': 1,
  'packages/bots/test/player.test.ts › sets sail at the first check the goal is met, buying nothing in it': 1,
  'packages/bots/test/player.test.ts › taps Listen while it owns nothing and nothing is affordable, then buys': 1,
  'packages/bots/test/player.test.ts › the Random Buyer buys until nothing is affordable, in its own order': 1,
  'packages/bots/test/run.test.ts › finds nothing in a new game’s view': 1,
  'packages/bots/test/run.test.ts › judges a return 15 minutes after each of the first day’s 3 opens': 2,
  'packages/bots/test/run.test.ts › plays the Casual Learner’s first day: 3 opens, sails timed from the first open': 3,
  'packages/bots/test/run.test.ts › times each goal from when the Understanding earned that run reached it: after the sail before, no later than its own sail, and for the Idler hours before an open lets it sail': 2,
  'packages/bots/test/streams.test.ts › draw floats in [0, 1)': 1,
  'packages/bots/test/streams.test.ts › is a whole, positive number of milliseconds': 1,
  'packages/bots/test/streams.test.ts › is always correct at R = 1': 1,
  'packages/bots/test/streams.test.ts › is never correct at R = 0': 1,
  'packages/bots/test/streams.test.ts › keeps opens at least an hour apart, from one day to the next too': 1,
  'packages/bots/test/streams.test.ts › places each open in its own slot of waking hours': 1,
  'packages/bots/test/streams.test.ts › places later opens at whole seconds of waking hours, in order': 1,
  'packages/bots/test/targets.test.ts › accepts a 15-minute return where only Practice is on offer (operator, 2026-10-04)': 1,
  'packages/bots/test/targets.test.ts › holds at gaps just inside 1 and 3 days': 2,
  'packages/bots/test/targets.test.ts › holds just before day 70': 1,
  'packages/bots/test/targets.test.ts › holds just inside 30 and 60 minutes': 2,
  'packages/bots/test/targets.test.ts › holds just inside day 21 and day 35': 2,
  'packages/bots/test/targets.test.ts › holds just over 95% of the Casual Learner’s time': 1,
  'packages/bots/test/targets.test.ts › holds when Diligent ≤ Casual ≤ Idler, ties included': 1,
  'packages/bots/test/targets.test.ts › holds when every open offered one': 1,
  'packages/bots/test/targets.test.ts › holds when the Casual Learner finishes just over 20% sooner': 1,
  'packages/bots/test/targets.test.ts › holds with no insane value': 1,
  'packages/bots/test/targets.test.ts › judges a return after every open when no finale ends the run': 1,
  'packages/bots/test/targets.test.ts › judges when each goal was reached, not the open the sail waited for (operator, 2026-10-04)': 1,
  'packages/bots/test/targets.test.ts › lets a variant cross by one open: a sail one open sooner would have kept within 3 days (operator, 2026-10-04)': 1,
  'packages/core/test/automation.test.ts › buys nothing when nothing is owned and nothing is affordable': 1,
  'packages/core/test/cards.test.ts › is not shown while no card is held': 1,
  'packages/core/test/grammar.test.ts › is empty with no node owned': 1,
  'packages/core/test/hash.test.ts › changes when any numeric field moves by one ulp': 1,
  'packages/core/test/ladder.test.ts › carries no tier into the course core plays': 1,
  'packages/core/test/log.test.ts › a log with a refused event inserted replays to the state without it': 1,
  'packages/core/test/review.test.ts › is empty when nothing is due': 2,
  "packages/core/test/sail.test.ts › a sail from destination ${String(i)} goes to ${IDS[i + 1] ?? ''}": 1,
  'packages/core/test/sail.test.ts › never needs a review: unreviewed words and no Insight still sail (D1)': 1,
  'packages/core/test/sail.test.ts › owns no Encounters and holds only the starting grant, with nothing spent': 1,
  'packages/core/test/sail.test.ts › resets exactly the Encounters owned and the Understanding held': 1,
  'packages/core/test/shop.test.ts › is not affordable before grammar opens, however much Insight is held': 1,
  'packages/core/test/shop.test.ts › offers nothing while every open slot is busy': 1,
  'packages/core/test/shop.test.ts › stays on offer with nothing else affordable, as Practice costs nothing': 1,
  'packages/core/test/words.test.ts › is refused when the pool is empty, never reaching a later destination': 1,
  'packages/lockdown/test/lockdown.test.ts › challenges %s on a non-prod host and never serves': 2,
  'packages/lockdown/test/lockdown.test.ts › challenges every request when the password is not configured': 1,
  'packages/lockdown/test/lockdown.test.ts › serves blocking robots.txt on a non-prod host': 1,
  'packages/lockdown/test/lockdown.test.ts › serves blocking robots.txt on a non-prod host without credentials': 1,
  'tests/unit/balance-variants.test.ts › %s changes only its own lever’s lines': 1,
  'tests/unit/burn-down.test.ts › ignores entries left over once their items are taken': 1,
  'tests/unit/burn-down.test.ts › leaves nothing when every item is matched': 1,
  'tests/unit/ci-scope.test.ts › a commit changing nothing is full (an empty diff)': 1,
  'tests/unit/ci-scope.test.ts › is full for a mix with the code path first, judging both': 1,
  'tests/unit/ci-scope.test.ts › is full for an empty diff, saying there was nothing to judge': 1,
  'tests/unit/ci-scope.test.ts › reads an empty diff as no changes': 1,
  'tests/unit/collection-calls.test.ts › classifies every call evaluated at collection, refusing by name what it cannot follow': 1,
  'tests/unit/collection-calls.test.ts › keeps no burn-down entry that has already been converted': 1,
  'tests/unit/collection-calls.test.ts › reaches no workspace code at collection beyond the burn-down list': 1,
  'tests/unit/collection-calls.test.ts › reads a describe callback in every file whose text holds a describe call': 1,
  'tests/unit/collection-calls.test.ts › reads describe.todo as no callback, refusing nothing': 1,
  'tests/unit/collection-calls.test.ts › reads test.describe.configure as no callback, refusing nothing': 1,
  'tests/unit/collection-calls.test.ts › what': 2,
  'tests/unit/core-determinism-lint.test.ts › is scoped to packages/core/src: the same code elsewhere is not banned': 2,
  'tests/unit/core-determinism-lint.test.ts › label': 1,
  'tests/unit/core-determinism-lint.test.ts › lint': 1,
  'tests/unit/core-import-graph.test.ts › counts a type-only declaration but draws no edge for it': 1,
  'tests/unit/core-import-graph.test.ts › every file under packages/core/src is a .ts module the graph reads': 1,
  'tests/unit/core-import-graph.test.ts › finds no cycle through a type-only import': 1,
  'tests/unit/core-import-graph.test.ts › finds none in a chain': 1,
  'tests/unit/core-import-graph.test.ts › finds none in a diamond, where two paths meet without returning': 1,
  'tests/unit/core-import-graph.test.ts › holds no value-import cycle': 1,
  'tests/unit/core-import-graph.test.ts › ignores an edge to a module outside the map': 1,
  'tests/unit/core-import-graph.test.ts › passes a module whose every relative specifier was judged': 1,
  'tests/unit/core-import-graph.test.ts › reads each module’s relative imports as its raw text counts them': 1,
  'tests/unit/core-import-graph.test.ts › refuses no import it cannot place in the graph': 1,
  'tests/unit/cross-engine-harness.test.ts › runs in CI, in the Playwright image that carries all three browsers (#44)': 1,
  'tests/unit/dev-config.test.ts › declares no secret as a plain var (the password is a Worker secret)': 1,
  'tests/unit/every-commit-ci.test.ts › checks out that ref, the event’s own commit when it is empty': 1,
  'tests/unit/every-commit-ci.test.ts › checks out the pull request’s head with its whole history': 1,
  'tests/unit/every-commit-ci.test.ts › judges with the verdict script, given the list, both results and a token': 1,
  'tests/unit/every-commit-ci.test.ts › lists the commits between the pull request’s base and head': 1,
  'tests/unit/every-commit-ci.test.ts › runs Node from .nvmrc, with no npm ci': 1,
  'tests/unit/every-commit.test.ts › ignores the run’s other jobs': 1,
  'tests/unit/every-commit.test.ts › passes a list of exactly the matrix limit': 1,
  'tests/unit/every-commit.test.ts › reads no output as no commits': 1,
  'tests/unit/every-commit.test.ts › reads no output, from a list job that failed, as no commits': 1,
  'tests/unit/licences.test.ts › no tracked file names the dissolved company or its old org handle': 1,
  'tests/unit/one-test-per-case.test.ts › classifies every call on it and test, refusing by name what it cannot read': 1,
  'tests/unit/one-test-per-case.test.ts › keeps no burn-down entry that has already been split': 1,
  'tests/unit/one-test-per-case.test.ts › leaves alone ${what}': 1,
  'tests/unit/one-test-per-case.test.ts › loops no known population inside a test beyond the burn-down list': 1,
  'tests/unit/one-test-per-case.test.ts › reads a Playwright annotation inside a test as no test': 1,
  'tests/unit/one-test-per-case.test.ts › reads a describe modifier as no test and refuses nothing': 1,
  'tests/unit/one-test-per-case.test.ts › reads at least one test in every file whose text holds a test call': 1,
  'tests/unit/shop-agreement.test.ts › every %s offer’s affordable is apply’s answer': 1,
  'tests/unit/supply-chain.test.ts › a sub-path group is declared before the catch-all that would swallow it': 1,
  'tests/unit/supply-chain.test.ts › an action repo used at more than one sub-path is grouped into one PR': 1,
  'tests/unit/supply-chain.test.ts › every container image is pinned to a digest, not just a tag': 1,
  'tests/unit/supply-chain.test.ts › every pinned action names the version its SHA resolves to': 1,
  'tests/unit/supply-chain.test.ts › every third-party action is pinned to a full commit SHA': 1,
  'tests/unit/supply-chain.test.ts › nothing under node_modules is tracked': 1,
  'tests/unit/supply-chain.test.ts › opens every PR against develop, never straight at main': 1,
  'tests/unit/supply-chain.test.ts › reads every file that can hold a uses: line (Refs #82)': 1,
  'tests/unit/supply-chain.test.ts › the Playwright image is the version of @playwright/test the lockfile installs': 1,
  'tests/unit/verify-dev.test.ts › accepts a 401 Basic challenge with no app in it': 1,
  'tests/unit/verify-dev.test.ts › accepts a robots.txt that blocks every crawler': 1,
  'tests/unit/verify-dev.test.ts › accepts ok, the commit, db ok and noindex': 1,
  'tests/unit/verify-dev.test.ts › accepts the expected commit with noindex': 1,
  'tests/unit/verify-dev.test.ts › never puts the password in a problem': 2,
  'tests/unit/verify-dev.test.ts › passes a gated site serving the expected commit, judging each check once': 1,
  'tests/unit/verify-dev.test.ts › waits for a stale deploy to turn current, then judges it once': 1,
  'tests/unit/workflow-secrets.test.ts › accepts a secret in a job that declares the dev environment': 1,
  'tests/unit/workflow-secrets.test.ts › accepts the long form, environment: { name: production, url }': 1,
  'tests/unit/workflow-secrets.test.ts › ignores GITHUB_TOKEN, which GitHub mints per run': 1,
  'tests/unit/workflow-secrets.test.ts › is not satisfied or tripped by a comment': 1,
  'tests/unit/workflow-secrets.test.ts › no secret is read outside a protected environment': 1,
  'tests/unit/workflow-secrets.test.ts › reads a reference in every workflow whose text names a stored secret (Refs #82)': 1,
  'tests/unit/workflow-secrets.test.ts › scans every workflow, and every one has jobs': 1,
  'tests/unit/workflow-timeouts.test.ts › accepts a call to a local reusable workflow, whose own jobs carry the timeouts': 1,
  'tests/unit/workflow-timeouts.test.ts › accepts a job with a timeout inside the bound': 1,
  'tests/unit/workflow-timeouts.test.ts › accepts the bound itself, ${String(MAX_TIMEOUT_MINUTES)} minutes': 1,
  'tests/unit/workflow-timeouts.test.ts › checks every job it finds (liveness)': 1,
  'tests/unit/workflow-timeouts.test.ts › every job has a timeout of at most 30 minutes': 1,
  'tests/unit/workflow-timeouts.test.ts › every reusable-workflow call names a workflow that is scanned here': 1,
};
```

- [ ] **Step 6: Record the meta-guard's floors**

`tests/floors.json`, as T3 changes it:

```diff
diff --git a/tests/floors.json b/tests/floors.json
index 06ee9a2..4b06698 100644
--- a/tests/floors.json
+++ b/tests/floors.json
@@ -1,4 +1,9 @@
 {
+  "floorless-searches/files": 149,
+  "floorless-searches/fixture-listed": 3,
+  "floorless-searches/fixture-walk": 2,
+  "floorless-searches/sites": 171,
+  "floorless-searches/tests": 1161,
   "record-floors/test-files": 73,
   "record-floors/workflow-steps": 30,
   "searched/count": 3,
```

- [ ] **Step 7: Run it green, gate the stage alone, commit**

Run: `npx vitest run tests/unit/floorless-searches.test.ts tests/unit/collection-calls.test.ts`, then every CI step, in `ci.yml`'s order (format, lint, typecheck, unit, pacing, worker, engines, build), on this stage alone after a clean `npm ci`. Commit: `The floorless-searches meta-guard and its burn-down list (Refs #361)`.

## Mutations (12, the whole unit suite each time)

Run on the Task 3 commit by `mutate.py`, which asserts each anchor applies exactly once, prints the change, runs the whole unit suite, refuses a run whose total is not the baseline (4,858), and restores from the commit. Predictions were written before any run: all 12 were caught as predicted, and every extra failure is the same defect seen again (the planted copy of a form in each kind of file, or the text-count test beside the repository check). One prediction was replaced before running: K1 first read `.not` as a throw matcher, which the call-shape check already refuses, so it could never have gone red; it now drops the "the block holds only this call" check instead.

| Mutation             | Change                                                                                                                                                                                                                                                                                  | Tests it turned red                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R1-blind-reader      | `tests/unit/floorless-searches.ts`: adds `if (Math.random() < 2) return;`                                                                                                                                                                                                               | 108: a Playwright spec: expect(againstControl(f, { input: NONE, control: ONE })).toEqual([]);; a Playwright spec: expect(o).toEqual({});; a Playwright spec: expect(o).toStrictEqual({});; a Playwright spec: expect(s.size).toBe(0);; a Playwright spec: expect(searched(f, { of: p, what: 'w' })).toEqual([]);; a Playwright spec: expect(text).not.toContain("<");; and 102 more                                                                                                                                                                                                |
| R2-blind-one-form    | `tests/unit/floorless-searches.ts`: `if (negated) return MEMBERSHIP.has(name) ? 'not-contained' : undefined;` → `if (negated) return undefined;`                                                                                                                                        | 14: a Playwright spec: expect(text).not.toContain("<");; a Playwright spec: expect(text).not.toMatch(/x/);; a Playwright spec: expect(xs).not.toContainEqual(1);; a helper: expect(text).not.toContain("<");; a helper: expect(text).not.toMatch(/x/);; a helper: expect(xs).not.toContainEqual(1);; and 8 more                                                                                                                                                                                                                                                                    |
| W1-narrow-walk       | `tests/unit/floorless-searches.test.ts`: `const files = committableFiles().filter((path) => /\.[cm]?ts$/.test(path));` → `const files = committableFiles().filter((path) => /\.test\.ts$/.test(path));`                                                                                 | 2: reads as many absence sites in each file as its text writes, over every file git has; reads as many tests in each file as its text writes                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| C1-blind-cross-check | `tests/unit/absence-text.ts`: `if (negated) return ['toContain', 'toContainEqual', 'toMatch'].includes(name);` → `if (negated) return false;`                                                                                                                                           | 11: a Playwright spec: expect(text).not.toContain("<");; a Playwright spec: expect(text).not.toMatch(/x/);; a Playwright spec: expect(xs).not.toContainEqual(1);; a helper: expect(text).not.toContain("<");; a helper: expect(text).not.toMatch(/x/);; a helper: expect(xs).not.toContainEqual(1);; a vitest test: expect(text).not.toContain("<");; a vitest test: expect(text).not.toMatch(/x/);; a vitest test: expect(xs).not.toContainEqual(1);; counts each bare form once as written; reads as many absence sites in each file as its text writes, over every file git has |
| B1-drop-entry        | `tests/unit/floorless-searches.burn-down.ts`: `'packages/core/test/review.test.ts › is empty when nothing is due': 2,` removed                                                                                                                                                          | 1: finds every scope holding exactly the unproved searches listed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| B2-past-ceiling      | `tests/unit/floorless-searches.burn-down.ts`: `'packages/core/test/review.test.ts › is empty when nothing is due': 2,` → `'packages/core/test/review.test.ts › is empty when nothing is due': 3,`; `packages/core/test/review.test.ts`: adds `expect(reviewQueue({}, T0)).toEqual([]);` | 2: finds every scope holding exactly the unproved searches listed; only shrinks the burn-down list                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| F1-any-floor         | `tests/unit/floorless-searches.ts`: `child.arguments[1] !== undefined && ⏎ counts.has(spelled(sf, child.arguments[1]))` → `child.arguments[1] !== undefined`                                                                                                                            | 2: reads a search whose test checks a floor on a population that only starts with the same name as unproved; reads a search whose test checks a floor on another population as unproved                                                                                                                                                                                                                                                                                                                                                                                            |
| K1-busy-block        | `tests/unit/floorless-searches.ts`: `if (!ts.isBlock(block) \|\| block.statements.length !== 1) return false;` → `if (!ts.isBlock(block)) return false;`                                                                                                                                | 1: reads a search in a block that does more as a site                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| A1-named-input       | `tests/unit/floorless-searches.ts`: `if (!isEmptyInput(input)) return false;` → `if (!isEmptyInput(input) && !ts.isIdentifier(input)) return false;`                                                                                                                                    | 4: a Playwright spec: expect(againstControl(f, { input: NONE, control: ONE })).toEqual([]);; a helper: expect(againstControl(f, { input: NONE, control: ONE })).toEqual([]);; a vitest test: expect(againstControl(f, { input: NONE, control: ONE })).toEqual([]);; reads a control over an input held in a name as unproved                                                                                                                                                                                                                                                       |
| A2-no-control-check  | `tests/searched.ts`: `if (!isSubstantive(run(control)))` → `if (!isSubstantive(run(control)) && Math.random() > 2)`                                                                                                                                                                     | 1: refuses a control that finds nothing: a dead run passes otherwise                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| L1-literals-kept     | `tests/unit/source-text.ts`: `ranges.push([node.getStart(sf), node.end]);` removed                                                                                                                                                                                                      | 4: counts a comment and a string spelling one as tests written; counts a comment and a string spelling them as written; reads as many absence sites in each file as its text writes, over every file git has; reads as many tests in each file as its text writes                                                                                                                                                                                                                                                                                                                  |
| L2-tables-unread     | `tests/unit/absence-text.ts`: `const table = last !== undefined && TABLES.has(last);` → `const table = false && last !== undefined && TABLES.has(last);`                                                                                                                                | 3: counts it.each as tests written; counts it.each with type arguments holding parentheses as tests written; reads as many tests in each file as its text writes                                                                                                                                                                                                                                                                                                                                                                                                                   |

## Finishing

- [ ] **Push and open the pull request** into `develop`, with the measurements of AC6 and the decisions above in its body, `Refs #361`.
- [ ] **Wait for CI with `~/.claude/scripts/wait-run.sh`**, then read every step by name at the head SHA read from `headRefOid`; merge on green and verify the dev deploy.

**Conversions filed (AC7),** each at most 13 points, scored against #59 to #62 (3 points each, about 1.75 burn-down sites per point, measured from their PRs #66 to #69; shyden.co.uk #477, 10 floors for 5 points, agrees), each with the ACs story AC7 asks for:

| Story                                             | Sites   | Scopes  | Points |
| ------------------------------------------------- | ------- | ------- | ------ |
| #368 the bots targets and calibration tests       | 22      | 17      | 13     |
| #369 the bots run, player and stream tests        | 22      | 18      | 13     |
| #370 the pacing suite and the web gate            | 11      | 11      | 5      |
| #371 the import-graph and collection-calls guards | 18      | 17      | 8      |
| #372 the supply-chain and verify-dev guards       | 17      | 16      | 8      |
| #373 the one-test-per-case and workflow guards    | 20      | 20      | 13     |
| #374 the CI-script and lint guards                | 19      | 18      | 13     |
| #375 the core packages and lockdown               | 21      | 19      | 13     |
| #376 the remaining small guards                   | 5       | 5       | 3      |
| **Total**                                         | **155** | **141** | **89** |

And #367 (5 points, operator decision): the 7 absence checks written as counts become lists the guard can see, with a ratcheted floor on scalar zeros.
