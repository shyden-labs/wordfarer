import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { floorBreach } from '../floors';
import { searched } from '../searched';
import { scanCollection } from '../unit/collection-calls';
import { committableFiles } from '../unit/tracked-files';
import { callsInTree } from '../unit/calls-in-tree';

/**
 * The collection-calls guard over every committable test file (#97, #356).
 * It reads the whole repository, a cost that grows with the tree, so it runs
 * in the guards suite (#515). The reader's tests on planted fixtures are unit
 * tests (tests/unit/collection-calls.test.ts).
 */

const TEST_FILE = /\.(test|spec)\.ts$/;

/** A describe call in raw text: `describe(`, `describe.each(`, `test.describe(`. */
const RAW_DESCRIBE_CALL = /(^|[^\w.$])((it|test)\.)?describe(\.\w+)*\s*\(/m;

/** Every tracked test file and what the detector read in it, scanned inside each test, never at collection. */
const readScan = () => {
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
    calls: read.flatMap(({ file, scan }) =>
      scan.calls.map((call) => `${file} ${call}`),
    ),
    uncounted: read
      .filter(
        ({ file, source, scan }) =>
          scan.calls.length !== callsInTree(source, file),
      )
      .map(({ file }) => file),
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

/** One walk per file, shared by its tests (#432: each test re-walked every file). */
let scanned: ReturnType<typeof readScan> | undefined;

const scan = () => (scanned ??= readScan());

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
    expect(
      searched(unread, {
        of: withDescribe,
        what: 'files whose text holds a describe call',
      }),
    ).toEqual([]);
    expect(
      floorBreach('collection-calls/files-with-describe', withDescribe),
    ).toBeUndefined();
  });

  it('lists every call in each file, as its parse tree counts them (#371)', () => {
    const { files, uncounted } = scan();
    expect(searched(uncounted, { of: files, what: 'test files' })).toEqual([]);
    expect(
      floorBreach('collection-calls/call-counted-files', files.length),
    ).toBeUndefined();
  });

  it('classifies every call evaluated at collection, refusing by name what it cannot follow', () => {
    const { calls, unclassified } = scan();
    expect(
      searched(unclassified, { of: calls, what: 'calls in test files' }),
    ).toEqual([]);
    expect(
      floorBreach('collection-calls/corpus-calls', calls.length),
    ).toBeUndefined();
  });

  it('reaches no workspace code at collection', () => {
    const { judged, sites } = scan();
    expect(
      searched(sites, { of: judged, what: 'calls evaluated at collection' }),
    ).toEqual([]);
    expect(
      floorBreach('collection-calls/corpus-judged', judged),
    ).toBeUndefined();
  });
});
