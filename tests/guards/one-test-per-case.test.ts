import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { scanTests } from '../unit/one-test-per-case';
import { minus } from '../unit/burn-down';
import { committableFiles } from '../unit/tracked-files';

/**
 * The one-test-per-case guard over every committable test file (#58), with its burn-down list.
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/one-test-per-case.test.ts).
 */

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
const readScan = () => {
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

/** One walk per file, shared by its tests (#432: each test re-walked every file). */
let scanned: ReturnType<typeof readScan> | undefined;

const scan = () => (scanned ??= readScan());

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
