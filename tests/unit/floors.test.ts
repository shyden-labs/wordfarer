import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FLOORS_DIR, RECORD_ENV, floorBreach, readFloors } from '../floors';
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
        'shrank: if it shrank, lower the figure in tests/floors/guard.json by hand ' +
        'and say why in the commit.',
    );
  });

  it('names a count above the figure as a population that grew', () => {
    expect(judge(8)).toBe(
      'guard/units: read 8, recorded 5. The population grew by 3: run npm ' +
        'run floors:record, read what it moved, and commit tests/floors/guard.json.',
    );
  });

  it('names an id that is not recorded', () => {
    expect(
      floorBreach('guard/other', 1, { floors: FLOORS, record: null }),
    ).toBe(
      'guard/other is not recorded in tests/floors/guard.json: run npm run floors:record',
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
    // The harness suites run from apps/web and apps/site, where a relative path to the
    // floors file names nothing.
    const fromRoot = readFloors();
    const was = process.cwd();
    process.chdir('apps/web');
    try {
      expect(readFloors()).toEqual(fromRoot);
    } finally {
      process.chdir(was);
    }
    expect(FLOORS_DIR).toBe('tests/floors');
  });
});

/** Each recorded file of the real directory, by guard, with its raw text (#406). */
const recordedFiles = () =>
  readdirSync(FLOORS_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => ({
      guard: name.slice(0, -'.json'.length),
      text: readFileSync(join(FLOORS_DIR, name), 'utf8'),
    }));

describe('the recorded floors, one file per guard (#406)', () => {
  // A positive cross-check rather than a floored search: a floor on this
  // directory's own size would change with every floor any ticket adds,
  // and lag one recording behind what the recorder writes. A misplaced id
  // or a bad figure makes readFloors throw, which fails this test.
  it('reads every id the files hold, as their raw text spells them', () => {
    const raw = recordedFiles().flatMap(({ text }) =>
      [...text.matchAll(/^ {2}"([^"\n]+)": /gm)].map(([, id]) => id),
    );
    expect(raw.length, 'the floors directory holds ids').toBeGreaterThan(0);
    expect(Object.keys(readFloors()).sort()).toEqual(raw.sort());
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
